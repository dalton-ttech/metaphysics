import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const buildRoot = resolve(root, "next-build-v6");
const standalone = resolve(buildRoot, "standalone");

if (!existsSync(resolve(standalone, "server.js"))) {
  throw new Error("Missing .next/standalone/server.js. Run npm run build first.");
}

mkdirSync(resolve(standalone, "next-build-v6"), { recursive: true });
cpSync(resolve(buildRoot, "static"), resolve(standalone, "next-build-v6", "static"), { recursive: true, force: true });
if (existsSync(resolve(root, "public"))) {
  cpSync(resolve(root, "public"), resolve(standalone, "public"), { recursive: true, force: true });
}

console.log(`Standalone package ready: ${standalone}`);
