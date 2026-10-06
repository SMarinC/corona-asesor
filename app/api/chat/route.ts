import { type ChatDeps, handleChat } from "@/lib/chat/handler";
import { errorResponse } from "@/lib/guard/errors";
import { errorMessage, log } from "@/lib/log";
import { createProductionChatDeps } from "@/lib/chat/production";

export const runtime = "nodejs";
export const maxDuration = 60;

// Memoised as a promise so concurrent cold-start requests share one set of limiters.
let depsPromise: Promise<ChatDeps> | null = null;

export async function POST(req: Request): Promise<Response> {
  depsPromise ??= createProductionChatDeps().catch((error) => {
    depsPromise = null; // do not cache a failed start
    throw error;
  });
  let deps: ChatDeps;
  try {
    deps = await depsPromise;
  } catch (error) {
    log("error", "chat_deps_unavailable", { message: errorMessage(error) });
    return errorResponse("model_error");
  }
  return handleChat(req, deps);
}
