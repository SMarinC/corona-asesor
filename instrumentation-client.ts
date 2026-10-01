import { initBotId } from "botid/client/core";

// Adds BotID's challenge headers to chat requests; /api/chat rejects bots in production.
initBotId({ protect: [{ path: "/api/chat", method: "POST" }] });
