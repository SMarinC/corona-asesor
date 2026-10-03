// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/chat/empty-state";
import { toBlocks } from "@/components/chat/message";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import { useCountdown } from "@/hooks/use-countdown";
import { SUGGESTIONS } from "@/lib/ui/suggestions";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tool = (id: string) => ({ type: "tool-searchSupplies", toolCallId: id, state: "input-streaming", input: {} }) as never;

describe("toBlocks", () => {
  it("groups consecutive tool calls into one work log and keeps text where it was written", () => {
    const message = {
      id: "m",
      role: "assistant",
      parts: [{ type: "step-start" }, tool("a"), tool("b"), { type: "text", text: "  " }, { type: "text", text: "Listo" }, tool("c")],
    } as unknown as CoronaUIMessage;
    expect(toBlocks(message).map((b) => (b.kind === "tools" ? b.parts.length : b.text))).toEqual([2, "Listo", 1]);
  });
});

describe("EmptyState", () => {
  it("offers complete projects and passes the picked prompt up", () => {
    const onPick = vi.fn();
    render(<EmptyState onPick={onPick} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(SUGGESTIONS[1].title) }));
    expect(onPick).toHaveBeenCalledWith(SUGGESTIONS[1].prompt);
  });

  it("disables the suggestions while the asesor is busy", () => {
    render(<EmptyState onPick={() => {}} disabled />);
    for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("useCountdown", () => {
  it("is null without a deadline and ticks down to zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    expect(renderHook(() => useCountdown(null)).result.current).toBeNull();
    const { result } = renderHook(() => useCountdown(1_000_000 + 3_000));
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(0);
  });

  it("starts no timer without a deadline", () => {
    vi.useFakeTimers();
    renderHook(() => useCountdown(null));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("SUGGESTIONS", () => {
  it("use the agent's own vocabulary and state the wet area and joint of every project", () => {
    for (const s of SUGGESTIONS) {
      expect(s.prompt, s.title).toMatch(/junta de \d+ mm/);
      expect(s.prompt, s.title).toMatch(/zona húmeda/);
      expect(s.prompt, s.title).not.toContain("residencial normal");
    }
    expect(SUGGESTIONS.filter((s) => /piso|terraza/i.test(s.title)).every((s) => /tráfico (bajo|medio|alto)/.test(s.prompt))).toBe(true);
  });
});
