import { type ChatDeps, handleChat } from "@/lib/chat/handler";
import { createProductionChatDeps } from "@/lib/chat/production";

export const runtime = "nodejs";
export const maxDuration = 60;

let deps: ChatDeps | null = null;

export async function POST(req: Request): Promise<Response> {
  deps ??= createProductionChatDeps();
  return handleChat(req, deps);
}
