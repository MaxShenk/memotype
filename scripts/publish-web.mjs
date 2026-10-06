import { cpSync, rmSync } from "node:fs";

// Cloudflare publishes the root dist folder. This PC already uses dist for MemoType.exe.
const out = process.env.CF_PAGES === "1" ? "dist" : "site";
rmSync(out, { recursive: true, force: true });
cpSync("web/dist", out, { recursive: true });
