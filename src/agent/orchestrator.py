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
from typing import Any

import anthropic

from src import config
from src.agent.prompts import SYSTEM_PROMPT
from src.agent.tools import ANTHROPIC_TOOLS, ToolDispatcher
from src.knowledge.duckdb_store import DuckDBStore
from src.knowledge.chroma_store import ChromaStore


class CoronaAgent:
    def __init__(self, max_tokens: int = 2048, max_turns: int = 12):
        config.assert_llm_ready()
        self.client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = config.ANTHROPIC_MODEL
        self.max_tokens = max_tokens
        self.max_turns = max_turns

        # Las fuentes de conocimiento se cargan con tolerancia a fallos:
        # si la base aún no está construida, el agente sigue vivo pero avisará.
        self.duck = self._try_duck()
        self.chroma = self._try_chroma()
        self.dispatcher = ToolDispatcher(
            self.duck, self.chroma, desperdicio_defecto=config.DESPERDICIO_DEFECTO
        )

        # Historial (formato de mensajes de Anthropic) y traza de herramientas.
        self.history: list[dict[str, Any]] = []
        self.trace: list[dict[str, Any]] = []

    def _try_duck(self) -> DuckDBStore | None:
        try:
            return DuckDBStore(read_only=True)
        except Exception as e:
            print(f"[aviso] DuckDB no disponible aún: {e}")
            return None

    def _try_chroma(self) -> ChromaStore | None:
        try:
            return ChromaStore()
        except Exception as e:
            print(f"[aviso] Chroma no disponible aún: {e}")
            return None

    # ------------------------------------------------------------------ chat
    def ask(self, user_message: str) -> dict[str, Any]:
        """Envía un mensaje del usuario y devuelve la respuesta final del agente.

        Returns:
            {"texto": str, "trace": [ {tool, input, output} ... de este turno ]}
        """
        self.history.append({"role": "user", "content": user_message})
        turn_trace: list[dict[str, Any]] = []

        for _ in range(self.max_turns):
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=SYSTEM_PROMPT,
                tools=ANTHROPIC_TOOLS,
                messages=self.history,
            )
            # Guardamos la respuesta del asistente (puede traer tool_use).
            self.history.append({"role": "assistant", "content": resp.content})

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
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": bloque.id,
                    "content": json.dumps(salida, ensure_ascii=False, default=str),
                })
            self.history.append({"role": "user", "content": tool_results})

        return {
            "texto": "Se alcanzó el máximo de pasos sin cerrar la propuesta. "
                     "Revisa la traza de herramientas para ver el avance.",
            "trace": turn_trace,
        }

    @staticmethod
    def _solo_texto(content) -> str:
        partes = [b.text for b in content if getattr(b, "type", None) == "text"]
        return "\n".join(partes).strip()

    def reset(self) -> None:
        self.history.clear()
        self.trace.clear()
