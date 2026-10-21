import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no layout engine, so it implements neither element scrolling nor
// ResizeObserver (used by react-resizable-panels); layout is not under test.
if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
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
