import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Pages are lazy-loaded; on slower machines the first import can exceed the 1 s default.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

// jsdom has no <dialog> showModal/close implementation.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});
