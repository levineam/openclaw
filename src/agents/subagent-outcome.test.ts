import { describe, expect, it } from "vitest";
import { classifySubagentOutcome, isTransientSubagentWaitError } from "./subagent-outcome.js";

describe("subagent outcome classification", () => {
  it("classifies restart/update interruptions distinctly", () => {
    const classified = classifySubagentOutcome({
      status: "error",
      error: "gateway closed (1006): gateway restarting for update",
    });
    expect(classified.kind).toBe("interrupted");
    expect(classified.statusLabel).toContain("restart/update");
    expect(classified.resumeHint).toBeTruthy();
  });

  it("keeps real failures as failures", () => {
    const classified = classifySubagentOutcome({ status: "error", error: "permission denied" });
    expect(classified.kind).toBe("error");
    expect(classified.statusLabel).toContain("permission denied");
  });

  it("detects transient gateway wait errors", () => {
    expect(isTransientSubagentWaitError("gateway closed (1006): no close reason")).toBe(true);
    expect(isTransientSubagentWaitError("gateway timeout after 30000ms")).toBe(true);
    expect(isTransientSubagentWaitError("permission denied")).toBe(false);
  });
});
