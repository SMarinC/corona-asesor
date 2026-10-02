import { checkBotId } from "botid/server";
import { createTools, getToolDeps } from "@/lib/agent/tools";
import { createGuardLimits, readGuardConfig } from "@/lib/guard/rate-limit";
import { log } from "@/lib/log";
import type { ChatDeps } from "./handler";
import { createScriptedDemoModel } from "./scripted-model";

type Env = Record<string, string | undefined>;

/** CORONA_SCRIPTED_MODEL=1 replays a scripted quote for local UI work; it is ignored on Vercel production. */
export function scriptedModelEnabled(env: Env = process.env): boolean {
  return env.CORONA_SCRIPTED_MODEL === "1" && env.VERCEL_ENV !== "production";
}

/** Real artifacts, Gemini (or the local script), Upstash (or the dev fallback) and BotID (bypassed outside production). */
export function createProductionChatDeps(env: Env = process.env): ChatDeps {
  const scripted = scriptedModelEnabled(env);
  if (scripted) log("warn", "scripted_model_active", { reason: "CORONA_SCRIPTED_MODEL=1" });
  return {
    model: scripted ? createScriptedDemoModel() : undefined,
    getTools: () => createTools(getToolDeps()),
    limits: createGuardLimits(readGuardConfig(env)),
    isBot: async () => (await checkBotId()).isBot,
  };
}
