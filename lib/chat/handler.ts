import { createAgentUIStreamResponse, InvalidToolInputError, type LanguageModel, NoSuchToolError, safeValidateUIMessages } from "ai";
import { createCoronaAgent, type CoronaUIMessage } from "@/lib/agent/agent";
import type { CoronaTools } from "@/lib/agent/tools";
import type { ToolDeps } from "@/lib/agent/tools/deps";
import { seedQuantityLedger } from "@/lib/agent/tools/quantity-history";
import { createQuantityLedger } from "@/lib/domain/quantity-check";
import { type ChatErrorCode, errorResponse, streamErrorCode } from "@/lib/guard/errors";
import { parseChatRequest } from "@/lib/guard/input";
import { clientIp, hashIp } from "@/lib/guard/ip";
import { checkLimits, type GuardLimits, type LimitCheck, recordModelCall } from "@/lib/guard/rate-limit";
import { errorMessage, log } from "@/lib/log";
import { createTurnLogger } from "./turn-log";

export interface ChatDeps {
  /** Defaults to Gemini; tests inject a mock. */
  model?: LanguageModel;
  /** Lazy, so rejected requests never load the catalog. `extra` carries this conversation's quantity ledger. */
  getTools: (extra: Pick<ToolDeps, "quantities">) => CoronaTools;
  limits: GuardLimits;
  isBot: () => Promise<boolean>;
  newRequestId?: () => string;
}

/** Guards in spec order (BotID → rate limits → input), then streams one agent turn. */
export async function handleChat(req: Request, deps: ChatDeps): Promise<Response> {
  const requestId = deps.newRequestId?.() ?? crypto.randomUUID();
  const ipHash = hashIp(clientIp(req.headers));
  const reject = (code: ChatErrorCode, reason: string, retryAfter?: number) => {
    log("warn", "chat_rejected", { requestId, ipHash, code, reason });
    return errorResponse(code, { retryAfter });
  };

  // Fail open if BotID itself errors (e.g. no OIDC token); the caps below still protect.
  let isBot = false;
  try {
    isBot = await deps.isBot();
  } catch (error) {
    log("error", "botid_unavailable", { requestId, message: errorMessage(error) });
  }
  if (isBot) return reject("bot_detected", "botid");

  // Fail open if the limiter backend is down: BotID and Gemini's own quota still apply.
  let limit: LimitCheck;
  try {
    limit = await checkLimits(deps.limits, ipHash);
  } catch (error) {
    log("error", "rate_limit_unavailable", { requestId, message: errorMessage(error) });
    limit = { ok: true };
  }
  if (!limit.ok) return reject(limit.code, limit.code, limit.retryAfter);

  const parsed = await parseChatRequest(req);
  if (!parsed.ok) return reject("invalid_input", parsed.reason);

  let tools: CoronaTools;
  let validated: Awaited<ReturnType<typeof safeValidateUIMessages<CoronaUIMessage>>>;
  // buildQuote checks its quantities against the computeMaterials results of this conversation.
  const quantities = createQuantityLedger();
  try {
    tools = deps.getTools({ quantities });
    validated = await safeValidateUIMessages<CoronaUIMessage>({ messages: parsed.messages, tools });
  } catch (error) {
    log("error", "chat_unhandled", { requestId, message: errorMessage(error) });
    return errorResponse("model_error");
  }
  if (!validated.success) return reject("invalid_input", "ui_message_validation");
  seedQuantityLedger(quantities, validated.data);

  const turn = createTurnLogger({ requestId, ipHash });
  const agent = createCoronaAgent({
    tools,
    model: deps.model,
    hooks: {
      ...turn.hooks,
      // checkLimits reserved step 0's model call. Every later call is charged, awaited, right before it starts:
      // a client abort, a stream error or a frozen serverless instance after the response cannot drop the charge.
      onModelCall: async (step) => {
        if (step === 0) return;
        try {
          await recordModelCall(deps.limits);
        } catch (error) {
          log("warn", "global_cap_record_failed", { requestId, step, message: errorMessage(error) });
        }
      },
    },
  });

  // On a client abort the SDK skips onEnd (and its onAbort only fires if someone still reads the stream), so the
  // request signal is what tells the turn logger. After a normal end or a failure, aborted() is a no-op.
  if (req.signal.aborted) turn.aborted();
  else req.signal.addEventListener("abort", () => turn.aborted(), { once: true });

  try {
    return await createAgentUIStreamResponse({
      agent,
      uiMessages: validated.data,
      abortSignal: req.signal,
      onError: (error) => {
        const code = streamErrorCode(error);
        // The SDK routes tool-error parts through this same callback: first with the NoSuchToolError /
        // InvalidToolInputError, then again with its stringified form for the tool-output-error part. Those are
        // recoverable and already counted as tool_error by the agent's onTool hook; only stream-level errors
        // (Error objects from the provider) end the turn.
        const toolLevel = typeof error === "string" || NoSuchToolError.isInstance(error) || InvalidToolInputError.isInstance(error);
        if (!toolLevel) turn.failed(code, error);
        return code;
      },
    });
  } catch (error) {
    turn.failed("model_error", error);
    return errorResponse("model_error");
  }
}
