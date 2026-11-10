import { mock } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const globals: Record<string, unknown> = {
  window: dom.window,
  Window: dom.window.Window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Text: dom.window.Text,
  Comment: dom.window.Comment,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLScriptElement: dom.window.HTMLScriptElement,
  InputEvent: dom.window.InputEvent,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  Node: dom.window.Node,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
};

for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = mock() as unknown as typeof Element.prototype.scrollTo;
}

const ResizeObserverMock = class { observe() {} unobserve() {} disconnect() {} };
Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });
Object.defineProperty(dom.window, "ResizeObserver", {value: ResizeObserverMock});
dom.window.matchMedia = (query: string) => ({matches:false, media:query, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, dispatchEvent(){return true;}, onchange:null});
