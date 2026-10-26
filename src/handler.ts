import { isToolCallEventType } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";
import type { ExtensionContext, ExtensionUIContext, ToolCallEvent } from "@oh-my-pi/pi-coding-agent";
import { matchesSkipPattern, isReadOnlyCommand, type ReviewDecision } from "./policy";
import { appendAuditRecord, type AuditRecord } from "./audit";
import { ReviewError, ReviewTimeoutError } from "./errors";
import { getReviewTimeoutBudgetMs, type ReviewConfig } from "./config";
import { shouldSendReviewNotification } from "./notification";

/** 非 bash 工具的审核文本长度上限，避免把整篇文件内容塞进审核请求。 */
const MAX_INPUT_CHARS = 8_000;

/** 宿主默认的工具调用钩子期限；宿主未注册该设置时按此值计算审核超时。 */
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 30_000;

export interface ToolCallPayload {
  /** bash 工具的命令原文；其它工具为 undefined。 */
  command?: string;
  /** 参与跳过规则匹配的文本。 */
  matchText: string;
  /** 发送给审核模型的完整描述。 */
  reviewText: string;
}

/**
 * 处理器依赖的宿主能力与外部调用。
 *
 * 宿主设置（审批模式、钩子期限、`ask.notify`）由入口读取后传入，审核模型调用
 * 与终端通知也在这里注入，因此整条审核链路可以在不触网、不写终端的情况下
 * 被测试驱动。
 */
export interface ToolCallHandlerDeps {
  /** 宿主生效的工具审批模式；非 `yolo` 时插件不介入。每次调用时读取。 */
  approvalMode: () => string | undefined;
  /** 宿主的工具调用钩子期限（毫秒）。每次调用时读取。 */
  toolCallTimeoutMs: () => number;
  /** 宿主 `ask.notify` 设置；`off` 时不推送等待选择通知。每次调用时读取。 */
  askNotify: () => string | undefined;
  /** 读取当前工作目录的插件配置。 */
  loadSettings: (cwd: string) => Promise<ReviewConfig>;
  /** 请求审核模型给出结论。 */
  review: (reviewText: string, settings: ReviewConfig, timeoutMs: number) => Promise<ReviewDecision>;
  /** 弹出确认框并返回用户的选择。 */
  confirm: (ui: Pick<ExtensionUIContext, "select">, title: string, message: string) => Promise<boolean>;
  /** 推送等待用户选择的终端通知。 */
  notify: () => void;
}

export function buildToolCallPayload(event: ToolCallEvent): ToolCallPayload {
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

/** tool_call 处理器的返回值：阻断时给出原因，放行时为 undefined。 */
export interface ToolCallOutcome {
  block: boolean;
  reason?: string;
}

/** tool_call 处理器签名。 */
export type ToolCallHandler = (event: ToolCallEvent, ctx: ExtensionContext) => Promise<ToolCallOutcome | undefined>;

/** 构造 tool_call 处理器：审核、确认与通知的完整链路。 */
export function createToolCallHandler(deps: ToolCallHandlerDeps): ToolCallHandler {
  return async (event, ctx) => {
    if (deps.approvalMode() !== "yolo") return;

    const tool = event.toolName;
    const payload = buildToolCallPayload(event);
    let settings: ReviewConfig;
    try {
      settings = await deps.loadSettings(ctx.cwd);
    } catch {
      return { block: true, reason: "审核配置文件无效或密钥环境变量未设置，已按安全策略阻止执行。" };
    }
    if (matchesSkipPattern(tool, payload.matchText, settings.skipCommands)) return;
    if (payload.command !== undefined && isReadOnlyCommand(payload.command)) return;

    const reviewTimeoutMs = getReviewTimeoutBudgetMs(settings.reviewTimeoutMs, deps.toolCallTimeoutMs());
    let decision: ReviewDecision;
    try {
      decision = await deps.review(payload.reviewText, settings, reviewTimeoutMs);
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

    if (shouldSendReviewNotification({ notifyEnabled: settings.notifyEnabled, hostAskNotify: deps.askNotify() })) {
      deps.notify();
    }

    const approved = await deps.confirm(
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
  };
}
