import { type ChatDeps, handleChat } from "@/lib/chat/handler";
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
  return handleChat(req, await depsPromise);
}
