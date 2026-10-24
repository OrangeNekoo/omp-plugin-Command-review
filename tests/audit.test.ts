import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendAuditRecord, type AuditRecord } from "../src/audit";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function makeRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    timestamp: "2026-10-24T00:00:00.000Z",
    tool: "bash",
    command: "rm -rf /tmp/example",
    input: "bash\nrm -rf /tmp/example",
    api: "chat-completions",
    model: "review-model",
    thinkingEnabled: false,
    verdict: "review",
    reason: "recursive deletion",
    outcome: "blocked",
    ...overrides,
  };
}

async function makeProject(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "omp-command-review-audit-"));
  temporaryDirectories.push(cwd);
  return cwd;
}

describe("audit log", () => {
  test("writes a JSON array under the current project's .omp directory", async () => {
    const cwd = await makeProject();

    await appendAuditRecord(cwd, makeRecord());

    const content = await readFile(path.join(cwd, ".omp", "command-review-audit.json"), "utf8");
    expect(JSON.parse(content)).toEqual([makeRecord()]);
  });

  test("appends to the existing array instead of overwriting it", async () => {
    const cwd = await makeProject();
    const second = makeRecord({ tool: "read", command: undefined, verdict: "pass", outcome: "allowed" });

    await appendAuditRecord(cwd, makeRecord());
    await appendAuditRecord(cwd, second);

    const content = await readFile(path.join(cwd, ".omp", "command-review-audit.json"), "utf8");
    expect(JSON.parse(content)).toEqual([makeRecord(), second]);
  });

  test("serializes concurrent writes so no record is lost", async () => {
    const cwd = await makeProject();

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        appendAuditRecord(cwd, makeRecord({ reason: `entry-${index}` })),
      ),
    );

    const content = await readFile(path.join(cwd, ".omp", "command-review-audit.json"), "utf8");
    const records: AuditRecord[] = JSON.parse(content);
    expect(records).toHaveLength(8);
    expect(records.every((record) => record.reason?.startsWith("entry-"))).toBe(true);
  });

  test("does not throw when audit storage cannot be written", async () => {
    await expect(appendAuditRecord("/dev/null/impossible", makeRecord({ outcome: "allowed" }))).resolves.toBe(false);
  });
});
