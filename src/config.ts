import os from "node:os";
import path from "node:path";
import { YAML } from "bun";
import { parseSkipPatterns } from "./policy";

/** `jev` 走 TypeSafe System One 端点，请求体由插件按官方格式构造。 */
export type ReviewApi = "responses" | "chat-completions" | "jev";

export interface ReviewConfig {
  endpointUrl?: string;
  api: ReviewApi;
  apiKey?: string;
  model?: string;
  skipCommands: string[];
  auditLogEnabled: boolean;
  thinkingEnabled: boolean;
  reviewTimeoutMs: number;
}

interface ReviewConfigFile {
  endpointUrl?: string;
  api?: ReviewApi;
  apiKey?: string;
  apiKeyEnv?: string;
  model?: string;
  skipCommands?: string[];
  auditLogEnabled?: boolean;
  thinkingEnabled?: boolean;
  reviewTimeoutMs?: number;
}


// Files are intentionally separate from omp's main config to keep this plugin's schema isolated.
// Project configuration wins over global configuration; both win over plugin-manager settings.
const CONFIG_FILE_NAME = "command-review.yml";

interface ReviewConfigLoadOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_API: ReviewApi = "chat-completions";
const DEFAULT_REVIEW_TIMEOUT_MS = 20_000;
const ENV_KEYS = {
  endpointUrl: "OMP_COMMAND_REVIEW_URL",
  api: "OMP_COMMAND_REVIEW_API",
  apiKey: "OMP_COMMAND_REVIEW_API_KEY",
  model: "OMP_COMMAND_REVIEW_MODEL",
  skipCommands: "OMP_COMMAND_REVIEW_SKIP_COMMANDS",
  auditLogEnabled: "OMP_COMMAND_REVIEW_AUDIT_LOG",
  thinkingEnabled: "OMP_COMMAND_REVIEW_THINKING",
  reviewTimeoutMs: "OMP_COMMAND_REVIEW_TIMEOUT_MS",
} as const;


function readString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`配置字段 ${field} 必须是字符串。`);
  const normalized = value.trim();
  return normalized || undefined;
}

function readApi(value: unknown, source: string): ReviewApi | undefined {
  const normalized = readString(value, `${source}.api`);
  if (normalized === undefined) return undefined;
  if (normalized !== "responses" && normalized !== "chat-completions" && normalized !== "jev") {
    throw new Error(`${source}.api 必须是 responses、chat-completions 或 jev。`);
  }
  return normalized;
}

function readSkipCommands(value: unknown, source: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return parseSkipPatterns(value);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`配置字段 ${source}.skipCommands 必须是字符串或字符串数组。`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}
function readBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") throw new Error(`配置字段 ${field} 必须是布尔值。`);
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`配置字段 ${field} 必须是布尔值。`);
}

function readPositiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const numberValue = typeof value === "number" ? value : Number(readString(value, field));
  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
    throw new Error(`配置字段 ${field} 必须是正整数毫秒数。`);
  }
  return numberValue;
}

export function getReviewTimeoutBudgetMs(reviewTimeoutMs: number, toolCallTimeoutMs: number): number {
  const hostBudgetMs = Math.max(1, Math.floor(toolCallTimeoutMs * 0.8));
  return Math.min(reviewTimeoutMs, hostBudgetMs);
}


function normalizeFile(value: unknown, source: string): ReviewConfigFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${source} 必须是 YAML 对象。`);
  }
  const record = value as Record<string, unknown>;
  const allowed: Record<string, true> = {
    endpointUrl: true,
    api: true,
    apiKey: true,
    apiKeyEnv: true,
    model: true,
    skipCommands: true,
    auditLogEnabled: true,
    thinkingEnabled: true,
    reviewTimeoutMs: true,
  };
  for (const key of Object.keys(record)) {
    if (!allowed[key]) throw new Error(`${source} 包含未知字段 ${key}。`);
  }
  return {
    endpointUrl: readString(record.endpointUrl, `${source}.endpointUrl`),
    api: readApi(record.api, source),
    apiKey: readString(record.apiKey, `${source}.apiKey`),
    apiKeyEnv: readString(record.apiKeyEnv, `${source}.apiKeyEnv`),
    model: readString(record.model, `${source}.model`),
    skipCommands: readSkipCommands(record.skipCommands, source),
    auditLogEnabled: readBoolean(record.auditLogEnabled, `${source}.auditLogEnabled`),
    thinkingEnabled: readBoolean(record.thinkingEnabled, `${source}.thinkingEnabled`),
    reviewTimeoutMs: readPositiveInteger(record.reviewTimeoutMs, `${source}.reviewTimeoutMs`),
  };

}
function normalizePluginSettings(settings: Record<string, unknown>): ReviewConfigFile {
  return {
    endpointUrl: readString(settings.endpointUrl, "plugin.endpointUrl"),
    api: readApi(settings.api, "plugin"),
    apiKey: readString(settings.apiKey, "plugin.apiKey"),
    model: readString(settings.model, "plugin.model"),
    skipCommands: readSkipCommands(settings.skipCommands, "plugin"),
    auditLogEnabled: readBoolean(settings.auditLogEnabled, "plugin.auditLogEnabled"),
    thinkingEnabled: readBoolean(settings.thinkingEnabled, "plugin.thinkingEnabled"),
    reviewTimeoutMs: readPositiveInteger(settings.reviewTimeoutMs, "plugin.reviewTimeoutMs"),
  };
}
function mergeConfigFiles(...sources: ReviewConfigFile[]): ReviewConfigFile {
  const merged: ReviewConfigFile = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      if (key === "apiKey") delete merged.apiKeyEnv;
      if (key === "apiKeyEnv") delete merged.apiKey;
      Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}


async function readConfigFile(filePath: string): Promise<ReviewConfigFile> {
  if (!(await Bun.file(filePath).exists())) return {};
  const source = await Bun.file(filePath).text();
  return normalizeFile(YAML.parse(source), filePath);
}

function resolveApiKey(apiKey: string | undefined, apiKeyEnv: string | undefined, env: NodeJS.ProcessEnv): string | undefined {
  const placeholder = apiKey?.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/)?.[1];
  const environmentName = apiKeyEnv ?? placeholder;
  if (environmentName) {
    const value = env[environmentName]?.trim();
    if (!value) throw new Error(`审核模型 API key 环境变量 ${environmentName} 未设置。`);
    return value;
  }
  return apiKey;
}

export async function loadReviewConfig(
  cwd: string,
  pluginSettings: Record<string, unknown>,
  options: ReviewConfigLoadOptions = {},
): Promise<ReviewConfig> {
  const env = options.env ?? process.env;
  const home = options.home ?? os.homedir();
  const globalFile = await readConfigFile(path.join(home, ".omp", "agent", CONFIG_FILE_NAME));
  const projectFile = await readConfigFile(path.join(cwd, ".omp", CONFIG_FILE_NAME));
  const environment: ReviewConfigFile = {
    endpointUrl: readString(env[ENV_KEYS.endpointUrl], "环境变量 OMP_COMMAND_REVIEW_URL"),
    api: readApi(env[ENV_KEYS.api], "环境变量 OMP_COMMAND_REVIEW_API"),
    apiKey: readString(env[ENV_KEYS.apiKey], "环境变量 OMP_COMMAND_REVIEW_API_KEY"),
    model: readString(env[ENV_KEYS.model], "环境变量 OMP_COMMAND_REVIEW_MODEL"),
    skipCommands: readSkipCommands(env[ENV_KEYS.skipCommands], "环境变量"),
    auditLogEnabled: readBoolean(env[ENV_KEYS.auditLogEnabled], "环境变量 OMP_COMMAND_REVIEW_AUDIT_LOG"),
    thinkingEnabled: readBoolean(env[ENV_KEYS.thinkingEnabled], "环境变量 OMP_COMMAND_REVIEW_THINKING"),
    reviewTimeoutMs: readPositiveInteger(env[ENV_KEYS.reviewTimeoutMs], "环境变量 OMP_COMMAND_REVIEW_TIMEOUT_MS"),
  };
  const merged = mergeConfigFiles(environment, normalizePluginSettings(pluginSettings), globalFile, projectFile);
  return {
    endpointUrl: merged.endpointUrl,
    api: merged.api ?? DEFAULT_API,
    apiKey: resolveApiKey(merged.apiKey, merged.apiKeyEnv, env),
    model: merged.model,
    skipCommands: merged.skipCommands ?? [],
    auditLogEnabled: merged.auditLogEnabled ?? false,
    thinkingEnabled: merged.thinkingEnabled ?? false,
    reviewTimeoutMs: merged.reviewTimeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS,
  };
}
