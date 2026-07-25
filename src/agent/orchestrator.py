"""Agente orquestador: un único agente que coordina las herramientas.

Implementa el loop de razonamiento con *tool use* de Anthropic:
    usuario -> LLM -> (tool_use)* -> tool_result -> LLM -> respuesta final

Componentes de arquitectura que este archivo activa (Technical Checklist):
    - LLM / motor de razonamiento  (Anthropic)
    - Tool use / function calling   (ANTHROPIC_TOOLS + ToolDispatcher)
    - Knowledge tools / RAG         (DuckDB + Chroma vía las tools)
    - Planning / orquestación       (loop multi-paso)
    - Observabilidad / logging      (self.trace de cada llamada)
    - Guardrails                    (system prompt "no inventar" + requiere_revision)
"""
from __future__ import annotations

import json
import logging
from typing import Any

import anthropic

from src import config
from src.agent.prompts import SYSTEM_PROMPT
from src.agent.tools import ANTHROPIC_TOOLS, ToolDispatcher
from src.knowledge.duckdb_store import DuckDBStore
from src.knowledge.chroma_store import ChromaStore

logger = logging.getLogger(__name__)

# El system prompt es el mismo en cada llamada (incluye todo el contexto
# institucional) y las tools nunca cambian: se marcan como cacheables para que
# Anthropic no vuelva a procesarlos en cada paso del loop ni en cada turno de
# la conversación (ahorra costo y latencia, sobre todo con max_turns>1).
_SYSTEM_BLOCKS = [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]
_TOOLS_CACHED = [dict(t) for t in ANTHROPIC_TOOLS]
if _TOOLS_CACHED:
    _TOOLS_CACHED[-1] = {**_TOOLS_CACHED[-1], "cache_control": {"type": "ephemeral"}}


class CoronaAgent:
    def __init__(
        self,
        max_tokens: int = config.ANTHROPIC_MAX_TOKENS,
        max_turns: int = 12,
        duck: DuckDBStore | None = None,
        chroma: ChromaStore | None = None,
    ):
        config.assert_llm_ready()
        self.client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = config.ANTHROPIC_MODEL
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

        # Historial (formato de mensajes de Anthropic) y traza de herramientas.
        # IMPORTANTE: cada CoronaAgent es de UNA sola conversación/sesión — no
        # debe compartirse entre usuarios (ver get_agent en app.py).
        self.history: list[dict[str, Any]] = []
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
        self.history.append({"role": "user", "content": user_message})
        turn_trace: list[dict[str, Any]] = []

        try:
            for _ in range(self.max_turns):
                resp = self.client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    system=_SYSTEM_BLOCKS,
                    tools=_TOOLS_CACHED,
                    messages=self.history,
                )
                # Guardamos la respuesta del asistente (puede traer tool_use).
                self.history.append({"role": "assistant", "content": resp.content})

                if resp.stop_reason == "max_tokens":
                    texto = self._solo_texto(resp.content)
                    logger.warning("Respuesta truncada por max_tokens (turno con %d pasos de tool use)", len(turn_trace))
                    return {
                        "texto": texto + "\n\n_(La respuesta se cortó por límite de longitud; "
                                 "pídeme que continúe si falta algo.)_",
                        "trace": turn_trace,
                        "truncado": True,
                    }

                if resp.stop_reason != "tool_use":
                    texto = self._solo_texto(resp.content)
                    return {"texto": texto, "trace": turn_trace}

                # Ejecutamos todas las tools solicitadas y devolvemos los resultados.
                tool_results = []
                for bloque in resp.content:
                    if getattr(bloque, "type", None) != "tool_use":
                        continue
                    salida = self.dispatcher.run(bloque.name, bloque.input or {})
                    registro = {"tool": bloque.name, "input": bloque.input, "output": salida}
                    turn_trace.append(registro)
                    self.trace.append(registro)
                    logger.info("tool=%s input=%s", bloque.name, bloque.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": bloque.id,
                        "content": json.dumps(salida, ensure_ascii=False, default=str),
                    })
                self.history.append({"role": "user", "content": tool_results})
        except Exception as e:
            logger.exception("Fallo llamando al modelo; se revierte el historial de este turno")
            del self.history[checkpoint:]
            return {
                "texto": "Tuve un problema hablando con el modelo. Intenta de nuevo en un momento.",
                "trace": turn_trace,
                "error": str(e),
            }

        # Se agotó max_turns: cerramos el turno con un mensaje del asistente
        # para no dejar como último mensaje uno de rol "user" (tool_results),
        # que dejaría el historial en un estado inválido para el próximo ask().
        mensaje_cierre = ("Se alcanzó el máximo de pasos sin cerrar la propuesta. "
                          "Revisa la traza de herramientas para ver el avance.")
        self.history.append({"role": "assistant", "content": mensaje_cierre})
        return {"texto": mensaje_cierre, "trace": turn_trace}

    @staticmethod
    def _solo_texto(content) -> str:
        partes = [b.text for b in content if getattr(b, "type", None) == "text"]
        return "\n".join(partes).strip()

    def reset(self) -> None:
        self.history.clear()
        self.trace.clear()
