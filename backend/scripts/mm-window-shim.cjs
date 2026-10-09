// Workaround for a known bug in @metamask/agent-wallet's beta plugin system:
// any plugin command declaring the `wallet-submit` capability crashes with
// "window.addEventListener is not a function" before execute() runs, in a
// pure Node.js environment with no real `window` global. Likely cause: a
// `typeof window !== 'undefined' ? window : {}` fallback pattern somewhere
// in their bundle, where something later unconditionally calls
// `.addEventListener` on that fallback object. This preloads a minimal
// EventTarget-based `window` so that call is a real (no-op-ish) function
// instead of crashing.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new (require("node:events").EventEmitter)();
  globalThis.window.addEventListener = (type, listener) => globalThis.window.on(type, listener);
  globalThis.window.removeEventListener = (type, listener) => globalThis.window.off(type, listener);
  globalThis.window.dispatchEvent = (event) => globalThis.window.emit(event?.type ?? "event", event);
}
