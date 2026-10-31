import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProgress } from "./AiProgress";

afterEach(() => vi.useRealTimers());

describe("AiProgress", () => {
  it("moves through the steps on the usual timing and waits on the last one", () => {
    vi.useFakeTimers();
    render(<AiProgress title="Tailoring" seconds={3} steps={["Read", "Match", "Check"]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 3: Read");
    act(() => vi.advanceTimersByTime(1250));
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 3: Match");
    // Slower than usual: the last step stays active instead of claiming it is done.
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("status")).toHaveTextContent("Step 3 of 3: Check");
  });
});
