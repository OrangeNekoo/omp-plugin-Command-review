import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import type { ExtensionAPI, ToolCallEvent } from "@oh-my-pi/pi-coding-agent";
import { isToolCallEventType } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";
import { matchesSkipPattern, isReadOnlyCommand, type ReviewDecision } from "./policy";
import { confirmHighRiskCommand } from "./confirmation";
import { appendAuditRecord, type AuditRecord } from "./audit";
import { ReviewError, ReviewTimeoutError } from "./errors";
import { reviewToolCall } from "./review";
import { getReviewTimeoutBudgetMs, loadReviewConfig, type ReviewConfig } from "./config";

const PLUGIN_NAME = "omp-command-review";
const approvalModeSetting = lookup("tools.approvalMode");
const extensionHandlerTimeoutSetting = lookup("extensionHandlers.toolCallTimeoutMs");
const reviewSettingsByCwd = new Map<string, Promise<ReviewConfig>>();

/** 非 bash 工具的审核文本长度上限，避免把整篇文件内容塞进审核请求。 */
const MAX_INPUT_CHARS = 8_000;

interface ToolCallPayload {
  /** bash 工具的命令原文；其它工具为 undefined。 */
  command?: string;
  /** 参与跳过规则匹配的文本。 */
  matchText: string;
  /** 发送给审核模型的完整描述。 */
  reviewText: string;
}

function buildToolCallPayload(event: ToolCallEvent): ToolCallPayload {
  if (isToolCallEventType("bash", event)) {
    const command = event.input.command;
    return { command, matchText: command, reviewText: `bash\n${command}` };
  }
  const serialized = JSON.stringify(event.input) ?? "{}";
  const truncated =
    serialized.length > MAX_INPUT_CHARS ? `${serialized.slice(0, MAX_INPUT_CHARS)}…（已截断）` : serialized;
  return { matchText: event.toolName, reviewText: `${event.toolName}\n${truncated}` };
}

function createTimeoutReason(error: ReviewTimeoutError, settings: ReviewConfig): string {
  const budgetNote = settings.reviewTimeoutMs > error.timeoutMs
    ? `；配置的 reviewTimeoutMs 为 ${settings.reviewTimeoutMs} 毫秒，但被宿主钩子预算压缩`
    : "";
  return [
    `命令审核超时：审核模型在 ${error.timeoutMs} 毫秒内未返回结果${budgetNote}。`,
    `端点：${settings.endpointUrl ?? "未配置"}；模型：${settings.model ?? "未配置"}；API：${settings.api}。`,
    "该工具调用已被阻止，未执行。请据此调整后续操作：去掉这条调用、改写为影响更小的形式，或在确认安全后由用户手动执行。",
  ].join("\n");
}

function describeFailure(error: unknown, settings: ReviewConfig): string {
  if (error instanceof ReviewTimeoutError) return createTimeoutReason(error, settings);
  if (error instanceof ReviewError) return `命令审核失败，已阻止执行：${error.message}`;
  return "命令审核失败，已阻止执行：审核服务暂不可用或配置无效。";
}

async function recordAudit(
  cwd: string,
  settings: ReviewConfig,
  payload: ToolCallPayload,
  tool: string,
  record: Pick<AuditRecord, "outcome" | "verdict" | "reason" | "error">,
): Promise<void> {
  if (!settings.auditLogEnabled) return;
  await appendAuditRecord(cwd, {
    timestamp: new Date().toISOString(),
    tool,
    command: payload.command,
    input: payload.reviewText,
    api: settings.api,
    model: settings.model ?? "",
    thinkingEnabled: settings.thinkingEnabled,
    ...record,
  });
}

export default function commandReviewExtension(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (approvalModeSetting?.get(pi.pi.settings) !== "yolo") return;

    const tool = event.toolName;
    const payload = buildToolCallPayload(event);
    let settingsPromise = reviewSettingsByCwd.get(ctx.cwd);
    if (!settingsPromise) {
      settingsPromise = getPluginSettings(PLUGIN_NAME, ctx.cwd).then((pluginSettings) =>
        loadReviewConfig(ctx.cwd, pluginSettings),
      );
      reviewSettingsByCwd.set(ctx.cwd, settingsPromise);
    }
    let settings: ReviewConfig;
    try {
      settings = await settingsPromise;
    } catch {
      return { block: true, reason: "审核配置文件无效或密钥环境变量未设置，已按安全策略阻止执行。" };
    }
    if (matchesSkipPattern(tool, payload.matchText, settings.skipCommands)) return;
    if (payload.command !== undefined && isReadOnlyCommand(payload.command)) return;

    const configuredToolCallTimeout = extensionHandlerTimeoutSetting?.get(pi.pi.settings);
    const toolCallTimeoutMs = typeof configuredToolCallTimeout === "number" ? configuredToolCallTimeout : 30_000;
    const reviewTimeoutMs = getReviewTimeoutBudgetMs(settings.reviewTimeoutMs, toolCallTimeoutMs);
    let decision: ReviewDecision;
    try {
      decision = await reviewToolCall(payload.reviewText, settings, reviewTimeoutMs);
    } catch (error) {
      const reason = describeFailure(error, settings);
      await recordAudit(ctx.cwd, settings, payload, tool, {
        outcome: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return { block: true, reason };
    }
    if (decision.verdict === "pass") {
      await recordAudit(ctx.cwd, settings, payload, tool, {
        outcome: "allowed",
        verdict: "pass",
        reason: decision.reason,
      });
      return;
    }
    if (!ctx.hasUI) {
      await recordAudit(ctx.cwd, settings, payload, tool, {
        outcome: "blocked",
        verdict: "review",
        reason: decision.reason,
      });
      return { block: true, reason: `命令未通过审核，当前没有交互式确认界面，已阻止执行：${decision.reason}` };
    }

    const approved = await confirmHighRiskCommand(
      ctx.ui,
      "命令审核未通过",
      `审核结论：${decision.reason}\n\n即将执行：\n${payload.reviewText}\n\n是否继续执行？`,
    );
    await recordAudit(ctx.cwd, settings, payload, tool, {
      outcome: approved ? "allowed" : "blocked",
      verdict: "review",
      reason: decision.reason,
    });
    if (!approved) return { block: true, reason: "用户拒绝或未确认该工具调用。" };
  });
}
