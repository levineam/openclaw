export type SubagentOutcomeStatus = "ok" | "error" | "timeout" | "unknown";

export type SubagentOutcomeLike = {
  status?: SubagentOutcomeStatus;
  error?: string;
};

export type SubagentOutcomeClassification = {
  kind: "ok" | "timeout" | "interrupted" | "error" | "unknown";
  statusLabel: string;
  resumeHint?: string;
};

const INTERRUPTED_RE =
  /\b(aborted|canceled|cancelled|interrupted|terminated|killed|stopped by signal|operation was aborted)\b/i;
const GATEWAY_TRANSIENT_RE =
  /\b(gateway closed|gateway timeout|abnormal closure|no close frame|socket hang up|connection reset|connection closed|ECONNRESET|EPIPE|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/i;
const RESTART_UPDATE_RE =
  /\b(restart(?:ing)?|update(?:ing)?|gateway restarting|daemon restart|maintenance)\b/i;

function normalizeErrorText(value?: string) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function isTransientSubagentWaitError(error?: string): boolean {
  const text = normalizeErrorText(error);
  if (!text) {
    return false;
  }
  if (RESTART_UPDATE_RE.test(text) && /gateway/i.test(text)) {
    return true;
  }
  return GATEWAY_TRANSIENT_RE.test(text);
}

function isInterruptedOutcomeError(error?: string): boolean {
  const text = normalizeErrorText(error);
  if (!text) {
    return false;
  }
  if (isTransientSubagentWaitError(text)) {
    return true;
  }
  return INTERRUPTED_RE.test(text);
}

export function classifySubagentOutcome(
  outcome?: SubagentOutcomeLike,
): SubagentOutcomeClassification {
  const status = outcome?.status ?? "unknown";
  const error = normalizeErrorText(outcome?.error);

  if (status === "ok") {
    return {
      kind: "ok",
      statusLabel: "completed successfully",
    };
  }

  if (status === "timeout") {
    return {
      kind: "timeout",
      statusLabel: "timed out",
      resumeHint: "If this task is still needed, resume from the existing subagent session.",
    };
  }

  if (isInterruptedOutcomeError(error)) {
    const restartRelated = RESTART_UPDATE_RE.test(error) || /gateway/i.test(error);
    return {
      kind: "interrupted",
      statusLabel: restartRelated
        ? "was interrupted (likely restart/update window)"
        : "was interrupted",
      resumeHint:
        "This looks like an interruption rather than a task failure. Resume or rerun once the gateway is stable.",
    };
  }

  if (status === "error") {
    return {
      kind: "error",
      statusLabel: `failed: ${error || "unknown error"}`,
    };
  }

  return {
    kind: "unknown",
    statusLabel: "finished with unknown status",
  };
}
