import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no layout engine, so it implements neither element scrolling nor
// ResizeObserver (used by react-resizable-panels); layout is not under test.
// Files under `@vitest-environment node` have no DOM at all.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
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
