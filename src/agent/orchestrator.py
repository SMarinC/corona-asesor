"""Agente orquestador: un único agente que coordina las herramientas.

Implementa el loop de razonamiento con *function calling* de Gemini:
    usuario -> LLM -> (function_call)* -> function_response -> LLM -> respuesta final

Componentes de arquitectura que este archivo activa (Technical Checklist):
    - LLM / motor de razonamiento  (Google Gemini)
    - Tool use / function calling   (AGENT_TOOLS + ToolDispatcher)
    - Knowledge tools / RAG         (DuckDB + Chroma vía las tools)
    - Planning / orquestación       (loop multi-paso)
    - Observabilidad / logging      (self.trace de cada llamada)
    - Guardrails                    (system prompt "no inventar" + requiere_revision)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from google import genai
from google.genai import types

from src import config
from src.agent.prompts import SYSTEM_PROMPT
from src.agent.tools import AGENT_TOOLS, ToolDispatcher
from src.knowledge.duckdb_store import DuckDBStore
from src.knowledge.chroma_store import ChromaStore

logger = logging.getLogger(__name__)

# Gemini no acepta claves JSON Schema fuera de un subconjunto reducido; nuestros
# esquemas ya están dentro de ese subconjunto (type/properties/items/required/
# enum/description), así que se pasan tal cual como `parameters`.
_FUNCTION_DECLARATIONS = [
    types.FunctionDeclaration(
        name=t["name"],
        description=t["description"],
        parameters=t["input_schema"],
    )
    for t in AGENT_TOOLS
]
_TOOLS = [types.Tool(function_declarations=_FUNCTION_DECLARATIONS)]


class CoronaAgent:
    def __init__(
        self,
        max_tokens: int = config.GEMINI_MAX_TOKENS,
        max_turns: int = 12,
        duck: DuckDBStore | None = None,
        chroma: ChromaStore | None = None,
    ):
        config.assert_llm_ready()
        self.client = genai.Client(api_key=config.GOOGLE_API_KEY)
        self.model = config.GEMINI_MODEL
        self.max_tokens = max_tokens
        self.max_turns = max_turns

        # Las fuentes de conocimiento se cargan con tolerancia a fallos: si la
        # base aún no está construida, el agente sigue vivo pero avisará.
        # Si el llamador ya tiene conexiones abiertas (p. ej. compartidas entre
        # sesiones de la UI), se reutilizan en vez de abrir nuevas.
        self.duck = duck if duck is not None else self._try_duck()
        self.chroma = chroma if chroma is not None else self._try_chroma()
        self.dispatcher = ToolDispatcher(
            self.duck, self.chroma, desperdicio_defecto=config.DESPERDICIO_DEFECTO
        )

        # Historial (formato de mensajes de Gemini: role "user"/"model") y
        # traza de herramientas.
        # IMPORTANTE: cada CoronaAgent es de UNA sola conversación/sesión — no
        # debe compartirse entre usuarios (ver get_agent en app.py).
        self.history: list[types.Content] = []
        self.trace: list[dict[str, Any]] = []

    @staticmethod
    def _try_duck() -> DuckDBStore | None:
        try:
            return DuckDBStore(read_only=True)
        except Exception as e:
            logger.warning("DuckDB no disponible aún: %s", e)
            return None

    @staticmethod
    def _try_chroma() -> ChromaStore | None:
        try:
            return ChromaStore()
        except Exception as e:
            logger.warning("Chroma no disponible aún: %s", e)
            return None

    # ------------------------------------------------------------------ chat
    def ask(self, user_message: str) -> dict[str, Any]:
        """Envía un mensaje del usuario y devuelve la respuesta final del agente.

        Returns:
            {"texto": str, "trace": [ {tool, input, output} ... de este turno ]}
        """
        # Si algo falla a mitad de turno, restauramos el historial a este punto
        # para no dejar un mensaje "user" sin su respuesta emparejada (lo que
        # rompería el próximo ask() con dos turnos "user" seguidos).
        checkpoint = len(self.history)
        self.history.append(types.Content(role="user", parts=[types.Part(text=user_message)]))
        turn_trace: list[dict[str, Any]] = []

        gen_config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=_TOOLS,
            max_output_tokens=self.max_tokens,
        )

        try:
            for _ in range(self.max_turns):
                resp = self.client.models.generate_content(
                    model=self.model,
                    contents=self.history,
                    config=gen_config,
                )

                candidate = resp.candidates[0] if resp.candidates else None
                if candidate is None:
                    raise RuntimeError("Gemini no devolvió ninguna respuesta.")

                content = candidate.content
                self.history.append(content)

                if candidate.finish_reason == types.FinishReason.MAX_TOKENS:
                    texto = self._solo_texto(content)
                    logger.warning("Respuesta truncada por max_tokens (turno con %d pasos de tool use)", len(turn_trace))
                    return {
                        "texto": texto + "\n\n_(La respuesta se cortó por límite de longitud; "
                                 "pídeme que continúe si falta algo.)_",
                        "trace": turn_trace,
                        "truncado": True,
                    }

                function_calls = [p.function_call for p in (content.parts or []) if p.function_call]
                if not function_calls:
                    texto = self._solo_texto(content)
                    return {"texto": texto, "trace": turn_trace}

                # Ejecutamos todas las funciones solicitadas y devolvemos los resultados.
                response_parts = []
                for fc in function_calls:
                    tool_input = dict(fc.args or {})
                    salida = self.dispatcher.run(fc.name, tool_input)
                    registro = {"tool": fc.name, "input": tool_input, "output": salida}
                    turn_trace.append(registro)
                    self.trace.append(registro)
                    logger.info("tool=%s input=%s", fc.name, tool_input)
                    response_parts.append(
                        types.Part.from_function_response(
                            name=fc.name,
                            response={"result": json.loads(json.dumps(salida, ensure_ascii=False, default=str))},
                        )
                    )
                self.history.append(types.Content(role="user", parts=response_parts))
        except Exception as e:
            logger.exception("Fallo llamando al modelo; se revierte el historial de este turno")
            del self.history[checkpoint:]
            return {
                "texto": "Tuve un problema hablando con el modelo. Intenta de nuevo en un momento.",
                "trace": turn_trace,
                "error": str(e),
            }

        # Se agotó max_turns: cerramos el turno con un mensaje del asistente
        # para no dejar como último mensaje uno de rol "user" (function_responses),
        # que dejaría el historial en un estado inválido para el próximo ask().
        mensaje_cierre = ("Se alcanzó el máximo de pasos sin cerrar la propuesta. "
                          "Revisa la traza de herramientas para ver el avance.")
        self.history.append(types.Content(role="model", parts=[types.Part(text=mensaje_cierre)]))
        return {"texto": mensaje_cierre, "trace": turn_trace}

    @staticmethod
    def _solo_texto(content: types.Content) -> str:
        partes = [p.text for p in (content.parts or []) if p.text]
        return "\n".join(partes).strip()

    def reset(self) -> None:
        self.history.clear()
        self.trace.clear()
