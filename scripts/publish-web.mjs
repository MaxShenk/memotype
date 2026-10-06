import { cpSync, rmSync } from "node:fs";

rmSync("site", { recursive: true, force: true });
cpSync("web/dist", "site", { recursive: true });
