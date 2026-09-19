import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Pack smoke test: `npm pack` must contain the executable entry with its
 * shebang and every runtime asset. Runs the packed binary's --help.
 */
const tmp = await mkdtemp(path.join(tmpdir(), "elyseum-pack-"));

try {
  execFileSync("npm", ["pack", "--pack-destination", tmp], { stdio: "inherit" });
  const files = await readFile(path.join(tmp, ".."), "utf-8").catch(() => "");
  const tgz = (await import("node:fs")).readdirSync(tmp).find((f) => f.endsWith(".tgz"));
  if (!tgz) {
    throw new Error("npm pack produced no tarball");
  }

  const extractDir = path.join(tmp, "package");
  execFileSync("tar", ["-xzf", path.join(tmp, tgz), "-C", tmp]);

  const bin = path.join(extractDir, "dist", "index.js");
  const content = await readFile(bin, "utf-8");
  if (!content.startsWith("#!/usr/bin/env node")) {
    throw new Error("packed dist/index.js is missing its shebang");
  }

  // run the packed binary
  const result = spawn(process.execPath, [bin, "--help"], { stdio: "pipe" });
  let output = "";
  result.stdout.on("data", (chunk) => (output += chunk));
  result.stderr.on("data", (chunk) => (output += chunk));
  const code = await new Promise((resolve) => result.on("close", resolve));
  if (code !== 0 || !output.includes("Elyseum CLI")) {
    throw new Error(`packed binary failed (exit ${code}): ${output}`);
  }

  console.log("pack smoke test passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
