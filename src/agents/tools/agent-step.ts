import crypto from "node:crypto";
import { callGateway } from "../../gateway/call.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import { AGENT_LANE_NESTED } from "../lanes.js";
import { extractAssistantText, stripToolMessages } from "./sessions-helpers.js";

export async function readLatestAssistantReply(params: {
  sessionKey: string;
  limit?: number;
  waitForOutputMs?: number;
  pollIntervalMs?: number;
}): Promise<string | undefined> {
  const waitForOutputMs =
    typeof params.waitForOutputMs === "number" && Number.isFinite(params.waitForOutputMs)
      ? Math.max(0, Math.min(10_000, Math.floor(params.waitForOutputMs)))
      : 0;
  const pollIntervalMs =
    typeof params.pollIntervalMs === "number" && Number.isFinite(params.pollIntervalMs)
      ? Math.max(100, Math.min(2_000, Math.floor(params.pollIntervalMs)))
      : 400;
  const startedAt = Date.now();

  while (true) {
    const history = await callGateway<{ messages: Array<unknown> }>({
      method: "chat.history",
      params: { sessionKey: params.sessionKey, limit: params.limit ?? 50 },
    });
    const filtered = stripToolMessages(Array.isArray(history?.messages) ? history.messages : []);
    const last = filtered.length > 0 ? filtered[filtered.length - 1] : undefined;
    const text = last ? extractAssistantText(last) : undefined;
    if (text && text.trim()) {
      return text;
    }
    if (waitForOutputMs <= 0) {
      return undefined;
    }
    const elapsed = Date.now() - startedAt;
    const remaining = waitForOutputMs - elapsed;
    if (remaining <= 0) {
      return undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
  }
}

export async function runAgentStep(params: {
  sessionKey: string;
  message: string;
  extraSystemPrompt: string;
  timeoutMs: number;
  channel?: string;
  lane?: string;
}): Promise<string | undefined> {
  const stepIdem = crypto.randomUUID();
  const response = await callGateway<{ runId?: string }>({
    method: "agent",
    params: {
      message: params.message,
      sessionKey: params.sessionKey,
      idempotencyKey: stepIdem,
      deliver: false,
      channel: params.channel ?? INTERNAL_MESSAGE_CHANNEL,
      lane: params.lane ?? AGENT_LANE_NESTED,
      extraSystemPrompt: params.extraSystemPrompt,
    },
    timeoutMs: 10_000,
  });

  const stepRunId = typeof response?.runId === "string" && response.runId ? response.runId : "";
  const resolvedRunId = stepRunId || stepIdem;
  const stepWaitMs = Math.min(params.timeoutMs, 60_000);
  const wait = await callGateway<{ status?: string }>({
    method: "agent.wait",
    params: {
      runId: resolvedRunId,
      timeoutMs: stepWaitMs,
    },
    timeoutMs: stepWaitMs + 2000,
  });
  if (wait?.status !== "ok") {
    return undefined;
  }
  return await readLatestAssistantReply({ sessionKey: params.sessionKey });
}
