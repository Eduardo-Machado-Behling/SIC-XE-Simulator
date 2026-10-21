import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no layout engine, so it implements neither element scrolling nor
// ResizeObserver (used by react-resizable-panels); layout is not under test.
if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
}

// cmdk (the command palette) scrolls the selected item into view.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}

if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

afterEach(() => {
    cleanup();
});
