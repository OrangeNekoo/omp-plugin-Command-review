import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendAuditRecord } from "../src/audit";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("audit log", () => {
  test("writes one JSONL record under the current project's .omp directory", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "omp-command-review-audit-"));
    temporaryDirectories.push(cwd);

    await appendAuditRecord(cwd, {
      timestamp: "2026-10-24T00:00:00.000Z",
      command: "rm -rf /tmp/example",
      api: "chat-completions",
      model: "review-model",
      thinkingEnabled: false,
      risk: "high",
      reason: "recursive deletion",
      outcome: "blocked",
    });

    const content = await readFile(path.join(cwd, ".omp", "command-review-audit.jsonl"), "utf8");
    expect(JSON.parse(content)).toEqual({
      timestamp: "2026-10-24T00:00:00.000Z",
      command: "rm -rf /tmp/example",
      api: "chat-completions",
      model: "review-model",
      thinkingEnabled: false,
      risk: "high",
      reason: "recursive deletion",
      outcome: "blocked",
    });
  });

  test("does not throw when audit storage cannot be written", async () => {
    await expect(
      appendAuditRecord("/dev/null/impossible", {
        timestamp: new Date(0).toISOString(),
        command: "echo test",
        api: "responses",
        model: "review-model",
        thinkingEnabled: true,
        risk: "low",
        reason: "no destructive effect",
        outcome: "allowed",
      }),
    ).resolves.toBe(false);
  });
});
