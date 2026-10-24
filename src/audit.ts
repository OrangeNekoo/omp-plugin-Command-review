import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ReviewApi } from "./config";

export type AuditRisk = "high" | "low" | "unknown";
export type AuditOutcome = "allowed" | "blocked" | "error";

export interface AuditRecord {
  timestamp: string;
  command: string;
  api: ReviewApi;
  model: string;
  thinkingEnabled: boolean;
  risk: AuditRisk;
  reason?: string;
  outcome: AuditOutcome;
  error?: string;
}

export async function appendAuditRecord(cwd: string, record: AuditRecord): Promise<boolean> {
  try {
    const directory = path.join(cwd, ".omp");
    await mkdir(directory, { recursive: true });
    await appendFile(path.join(directory, "command-review-audit.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}
