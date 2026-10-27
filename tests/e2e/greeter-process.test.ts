import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
let outDir = "";

function greeter(env: Record<string, string>) {
  return spawnSync(process.execPath, [join(outDir, "main.js")], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    encoding: "utf8",
    timeout: 20_000,
  });
}

describe("the greeter as a process, the way the workflows run it", () => {
  // The program is compiled the way `npm run build` compiles it, into a temporary folder, and run with plain node.
  // The build script cannot be relied on here: the lab replaces it with the fork's.
  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "greeter-"));
    const compile = spawnSync(
      process.execPath,
      [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json", "--outDir", outDir],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    if (compile.status !== 0) throw new Error(`tsc failed: ${compile.stdout}${compile.stderr}`);
    // The compiled files are ES modules; outside the project folder nothing says so, so say it.
    writeFileSync(join(outDir, "package.json"), '{ "type": "module" }\n');
  }, 150_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("prints the injection title as one line of text and runs nothing", () => {
    const result = greeter({
      ISSUE_AUTHOR: "outside-contributor",
      ISSUE_TITLE: 'Looks fine"; echo INJECTED-COMMAND-RAN; echo "',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.split("\n").filter(Boolean)).toHaveLength(1);
    expect(result.stdout).toContain("INJECTED-COMMAND-RAN");
    expect(result.stdout.startsWith("New issue from outside-contributor: Looks fine")).toBe(true);
  });

  it("exits 2 without the variables", () => {
    expect(greeter({}).status).toBe(2);
  });
});
