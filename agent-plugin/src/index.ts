// This plugin has no runtime entry point of its own — the host discovers
// commands via the `mm` manifest block in package.json, resolving each
// command id to its compiled file under dist/commands/. This file exists
// only so package.json's `main` field resolves to something real.
export {};
