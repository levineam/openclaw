import { afterEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();

vi.mock("../../gateway/call.js", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

describe("readLatestAssistantReply", () => {
  afterEach(() => {
    callGatewayMock.mockReset();
    vi.useRealTimers();
  });

  it("polls briefly before returning no output", async () => {
    vi.useFakeTimers();
    callGatewayMock.mockResolvedValue({ messages: [] });

    const { readLatestAssistantReply } = await import("./agent-step.js");
    const pending = readLatestAssistantReply({
      sessionKey: "agent:main:subagent:test",
      waitForOutputMs: 2_000,
      pollIntervalMs: 500,
    });

    await vi.advanceTimersByTimeAsync(2_100);
    const reply = await pending;

    expect(reply).toBeUndefined();
    expect(callGatewayMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("returns assistant output once it appears during polling", async () => {
    vi.useFakeTimers();
    callGatewayMock.mockResolvedValueOnce({ messages: [] }).mockResolvedValueOnce({
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ],
    });

    const { readLatestAssistantReply } = await import("./agent-step.js");
    const pending = readLatestAssistantReply({
      sessionKey: "agent:main:subagent:test",
      waitForOutputMs: 2_000,
      pollIntervalMs: 500,
    });

    await vi.advanceTimersByTimeAsync(600);
    const reply = await pending;

    expect(reply).toBe("done");
    expect(callGatewayMock).toHaveBeenCalledTimes(2);
  });
});
