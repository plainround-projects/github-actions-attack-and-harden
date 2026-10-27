import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function greeter(env: Record<string, string>) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: root,
    env: { PATH: process.env["PATH"] ?? "", ...env },
    encoding: "utf8",
  });
}

describe("the greeter as a process, the way the workflows run it", () => {
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
