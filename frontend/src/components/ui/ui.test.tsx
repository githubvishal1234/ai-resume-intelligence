import { Settings } from "lucide-react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NavList, NavRow } from "@/components/layout/NavList";
import { Button } from "./Button";
import { ScoreBar, ScoreRing } from "./Score";
import { Tabs } from "./Tabs";

describe("Button", () => {
  it("does nothing and explains why when disabledReason is set", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabledReason="Needs an AI provider.">
        Tailor
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Tailor/ });
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Needs an AI provider.");
  });
});

describe("Score", () => {
  it("exposes the value as text, not only colour", () => {
    render(
      <>
        <ScoreRing value={84} label="Match" />
        <ScoreBar value={55} label="Keywords" />
      </>,
    );
    expect(screen.getByRole("img", { name: "Match: 84 out of 100, Strong" })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Keywords" })).toHaveAttribute("aria-valuenow", "55");
  });
});

describe("Tabs", () => {
  function Harness() {
    const [value, setValue] = useState("a");
    return (
      <Tabs label="Input" value={value} onChange={setValue} tabs={[{ id: "a", label: "Paste" }, { id: "b", label: "Upload" }]}>
        panel {value}
      </Tabs>
    );
  }

  it("supports arrow-key navigation", async () => {
    render(<Harness />);
    screen.getByRole("tab", { name: "Paste" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Upload" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel b");
  });
});

describe("NavList", () => {
  it("links every destination once all phases are built", () => {
    render(
      <MemoryRouter>
        <NavList />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Interview Prep/ })).toHaveAttribute("href", "/interview");
    expect(document.querySelector("[aria-disabled=true]")).toBeNull();
  });

  it("renders an unbuilt destination as disabled, not as a link", () => {
    render(
      <MemoryRouter>
        <NavRow item={{ id: "later", label: "Later feature", icon: Settings, phase: 10, phaseNote: "Later" }} />
      </MemoryRouter>,
    );
    const row = screen.getByText("Later feature").closest("[role=link]");
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).not.toHaveAttribute("href");
  });
});
