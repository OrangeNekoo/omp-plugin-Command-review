import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewApi } from "./config";

export type AuditOutcome = "allowed" | "blocked" | "error";

export interface AuditRecord {
  timestamp: string;
  tool: string;
  command?: string;
  input: unknown;
  api: ReviewApi;
  model: string;
  thinkingEnabled: boolean;
  verdict?: "pass" | "review";
  reason?: string;
  outcome: AuditOutcome;
  error?: string;
}

const AUDIT_FILE_NAME = "command-review-audit.json";

/** 同一目录下的写入串行化，避免并发工具调用互相覆盖整个 JSON 数组。 */
const auditQueues = new Map<string, Promise<unknown>>();

async function readExistingRecords(filePath: string): Promise<AuditRecord[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return Array.isArray(parsed) ? (parsed as AuditRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeRecords(cwd: string, record: AuditRecord): Promise<void> {
  const directory = path.join(cwd, ".omp");
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, AUDIT_FILE_NAME);
  const records = await readExistingRecords(filePath);
  records.push(record);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

/**
 * 把一条审核记录追加进项目内的 JSON 数组日志。
 * 返回 false 表示写入失败；调用方不应因此改变审核结论。
 */
export async function appendAuditRecord(cwd: string, record: AuditRecord): Promise<boolean> {
  const previous = auditQueues.get(cwd) ?? Promise.resolve();
  const current = previous.then(
    () => writeRecords(cwd, record),
    () => writeRecords(cwd, record),
  );
  auditQueues.set(
    cwd,
    current.catch(() => undefined),
  );
  try {
    await current;
    return true;
  } catch {
    return false;
  }
}
