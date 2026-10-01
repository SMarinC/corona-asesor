import { checkBotId } from "botid/server";
import { createTools, getToolDeps } from "@/lib/agent/tools";
import { createGuardLimits, readGuardConfig } from "@/lib/guard/rate-limit";
import type { ChatDeps } from "./handler";

/** Real artifacts, Gemini, Upstash (or the dev fallback) and BotID (bypassed outside production). */
export function createProductionChatDeps(): ChatDeps {
  return {
    getTools: () => createTools(getToolDeps()),
    limits: createGuardLimits(readGuardConfig()),
    isBot: async () => (await checkBotId()).isBot,
  };
}
