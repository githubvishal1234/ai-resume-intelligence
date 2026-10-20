import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const JOB = "33333333-3333-4333-8333-333333333333";
const APP = "44444444-4444-4444-8444-444444444444";

describe("global search", () => {
  it("shows grouped results and opens one with the keyboard", async () => {
    const user = userEvent.setup();
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/jobs", body: [] },
      {
        path: "/search?q=north",
        body: {
          query: "north",
          hits: [
            { kind: "job", id: JOB, title: "Senior Backend Engineer", subtitle: "Northwind" },
            { kind: "application", id: APP, title: "Senior Backend Engineer", subtitle: "Northwind · applied" },
          ],
        },
      },
      { path: `/applications/${APP}`, status: 404, body: { code: "NOT_FOUND", message: "Not found.", request_id: "r" } },
    ]);
    renderApp("/jobs");
    const box = await screen.findByRole("combobox", { name: /Search your resumes/ });
    await user.type(box, "north");
    const list = await screen.findByRole("listbox", { name: "Search results" });
    expect(await within(list).findByRole("group", { name: "Jobs" })).toHaveTextContent("Northwind");
    expect(within(list).getByRole("group", { name: "Applications" })).toBeInTheDocument();
    expect(within(list).getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/not found/i)).toBeInTheDocument(); // navigated to the application
  });

  it("says when nothing matches and needs two characters", async () => {
    const user = userEvent.setup();
    mockApi([
      { path: "/auth/me", body: SESSION },
      { path: "/jobs", body: [] },
      { path: "/search?q=zzz", body: { query: "zzz", hits: [] } },
    ]);
    renderApp("/jobs");
    const box = await screen.findByRole("combobox", { name: /Search your resumes/ });
    await user.type(box, "z");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.type(box, "zz");
    expect(await screen.findByText("Nothing matches “zzz”.")).toBeInTheDocument();
  });
});
