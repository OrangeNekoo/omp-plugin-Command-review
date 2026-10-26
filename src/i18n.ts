/**
 * 插件的用户可见文案。
 *
 * 语言只影响面向用户的提示：确认框、终端通知、阻断原因与配置/审核错误。
 * 发给审核模型的提示词与判据不随语言变化，审核行为在任何语言下保持一致。
 */

export type Language = "zh-CN" | "en";

export const DEFAULT_LANGUAGE: Language = "zh-CN";

const LANGUAGES: readonly Language[] = ["zh-CN", "en"];

/** 解析配置里的语言取值；无法识别时回落到默认语言。 */
export function resolveLanguage(value: string | undefined): Language {
	if (value === undefined) return DEFAULT_LANGUAGE;
	const normalized = value.trim().toLowerCase();
	if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh_cn") return "zh-CN";
	if (normalized === "en" || normalized === "en-us" || normalized === "en_us") return "en";
	return DEFAULT_LANGUAGE;
}

/** 该取值是否是受支持的语言。 */
export function isSupportedLanguage(value: string): value is Language {
	return LANGUAGES.includes(value as Language);
}

/** 确认框与各类提示里的全部文案。 */
export interface Messages {
	/** 确认框标题。 */
	confirmTitle: string;
	/** 审核结论标签。 */
	verdictLabel: string;
	/** 即将执行的内容标签。 */
	upcomingLabel: string;
	/** 标签与其后内容之间的分隔符（内容在同一行）。 */
	labelSeparator: string;
	/** 行尾标签的结尾（行尾无需尾随空格）。 */
	labelSuffix: string;
	/** 是否继续执行的提问。 */
	continueQuestion: string;
	/** 确认框的肯定选项。 */
	approveOption: string;
	/** 确认框的否定选项。 */
	rejectOption: string;
	/** 终端通知正文。 */
	notificationBody: string;
	/** 命令被截断时的省略提示。 */
	commandTruncated: (omittedLines: number) => string;
	/** 没有交互界面时的阻断原因。 */
	noUiBlockedReason: (verdict: string) => string;
	/** 用户拒绝时的阻断原因。 */
	userRejectedReason: string;
	/** 配置无效时的阻断原因。 */
	invalidConfigReason: string;
	/** 审核请求超时的阻断原因。 */
	timeoutReason: (timeoutMs: number, budgetNote: string) => string;
	/** 超时预算被宿主钩子压缩时的补充说明。 */
	timeoutBudgetNote: (reviewTimeoutMs: number) => string;
	/** 审核失败的阻断原因前缀，后接具体错误。 */
	reviewFailedReason: (detail: string) => string;
	/** 审核服务不可用时的阻断原因。 */
	reviewUnavailableReason: string;
	/** 审核模型 URL 协议非法的错误。 */
	urlSchemeInvalid: string;
	/** 审核模型 URL 内含账号或密钥的错误。 */
	urlCredentialsInvalid: string;
	/** 未配置审核模型 URL 的错误。 */
	endpointMissing: string;
	/** 未配置审核模型 ID 的错误。 */
	modelMissing: string;
	/** 无法连接审核模型服务的错误。 */
	serviceUnreachable: string;
	/** 审核模型未返回完整结果的错误。 */
	incompleteResult: string;
	/** 审核模型响应格式无效的错误。 */
	invalidResponseFormat: string;
	/** jev 端点地址不合法的错误。 */
	jevEndpointInvalid: (endpointUrl: string) => string;
	/** jev 未配置 API key 的错误。 */
	jevApiKeyMissing: string;
	/** jev 响应格式无效的错误。 */
	jevInvalidResponse: string;
	/** jev 返回 HTTP 错误的说明。 */
	jevHttpError: (status: number, detail: string | undefined, endpoint: string) => string;
	/** 无法连接 jev 审核服务的错误。 */
	jevUnreachable: (endpoint: string) => string;
	/** jev 判定为可通过的结论。 */
	jevPassed: string;
	/** jev 判定为需人工审查的结论。 */
	jevNeedsReview: string;
}

const ZH_CN: Messages = {
	confirmTitle: "命令审核未通过",
	verdictLabel: "审核结论",
	upcomingLabel: "即将执行",
	labelSeparator: "：",
	labelSuffix: "：",
	continueQuestion: "是否继续执行？",
	approveOption: "是",
	rejectOption: "否",
	notificationBody: "命令审核未通过，等待确认",
	commandTruncated: (omittedLines) => `…（另有 ${omittedLines} 行）`,
	noUiBlockedReason: (verdict) => `命令未通过审核，当前没有交互式确认界面，已阻止执行：${verdict}`,
	userRejectedReason: "用户拒绝或未确认该工具调用。",
	invalidConfigReason: "审核配置文件无效或密钥环境变量未设置，已按安全策略阻止执行。",
	timeoutReason: (timeoutMs, budgetNote) =>
		[
			`命令审核超时：审核模型在 ${timeoutMs} 毫秒内未返回结果${budgetNote}。`,
			"该工具调用已被阻止，未执行。请据此调整后续操作：去掉这条调用、改写为影响更小的形式，或在确认安全后由用户手动执行。",
		].join("\n"),
	timeoutBudgetNote: (reviewTimeoutMs) =>
		`；配置的 reviewTimeoutMs 为 ${reviewTimeoutMs} 毫秒，但被宿主钩子预算压缩`,
	reviewFailedReason: (detail) => `命令审核失败，已阻止执行：${detail}`,
	reviewUnavailableReason: "命令审核失败，已阻止执行：审核服务暂不可用或配置无效。",
	urlSchemeInvalid: "审核模型 URL 必须使用 HTTP 或 HTTPS。",
	urlCredentialsInvalid: "请勿将账号或密钥写入审核模型 URL。",
	endpointMissing: "未配置审核模型 URL，请先完成插件配置。",
	modelMissing: "未配置审核模型 ID，请先完成插件配置。",
	serviceUnreachable: "无法连接审核模型服务。",
	incompleteResult: "审核模型未返回完整结果。",
	invalidResponseFormat: "审核模型响应格式无效。",
	jevEndpointInvalid: (endpointUrl) =>
		`api=jev 时 endpointUrl 需指向 TypeSafe 端点（以 /systemone 或 /v1 结尾），当前为 ${endpointUrl}。`,
	jevApiKeyMissing: "JEV 审核需要配置 API key。",
	jevInvalidResponse: "JEV 审核响应格式无效。",
	jevHttpError: (status, detail, endpoint) =>
		`审核服务返回 HTTP ${status}${detail ? `：${detail}` : ""}（${endpoint}）。`,
	jevUnreachable: (endpoint) => `无法连接审核服务（${endpoint}）。`,
	jevPassed: "JEV 判定可以执行。",
	jevNeedsReview: "JEV 判定需要人工审查。",
};

const EN: Messages = {
	confirmTitle: "Command review failed",
	verdictLabel: "Review verdict",
	upcomingLabel: "About to run",
	labelSeparator: ": ",
	labelSuffix: ":",
	continueQuestion: "Continue?",
	approveOption: "Yes",
	rejectOption: "No",
	notificationBody: "Command review failed, waiting for confirmation",
	commandTruncated: (omittedLines) => `… (${omittedLines} more lines)`,
	noUiBlockedReason: (verdict) =>
		`The command failed the review and there is no interactive confirmation UI, so it was blocked: ${verdict}`,
	userRejectedReason: "The user declined or did not confirm this tool call.",
	invalidConfigReason: "The review configuration is invalid or the key environment variable is unset, so the call was blocked.",
	timeoutBudgetNote: (reviewTimeoutMs) =>
		`; the configured reviewTimeoutMs of ${reviewTimeoutMs} ms was compressed by the host hook budget`,
	timeoutReason: (timeoutMs, budgetNote) =>
		[
			`Command review timed out: the review model did not answer within ${timeoutMs} ms${budgetNote}.`,
			"The tool call was blocked and did not run. Adjust it accordingly: drop the call, rewrite it in a less invasive form, or run it manually once you are sure it is safe.",
		].join("\n"),
	reviewFailedReason: (detail) => `Command review failed, so the call was blocked: ${detail}`,
	reviewUnavailableReason: "Command review failed, so the call was blocked: the review service is unavailable or misconfigured.",
	urlSchemeInvalid: "The review model URL must use HTTP or HTTPS.",
	urlCredentialsInvalid: "Do not put an account or a secret in the review model URL.",
	endpointMissing: "No review model URL is configured; finish the plugin setup first.",
	modelMissing: "No review model ID is configured; finish the plugin setup first.",
	serviceUnreachable: "Cannot reach the review model service.",
	incompleteResult: "The review model did not return a complete result.",
	invalidResponseFormat: "The review model returned an invalid response.",
	jevEndpointInvalid: (endpointUrl) =>
		`With api=jev the endpointUrl must point at a TypeSafe endpoint (ending in /systemone or /v1); it is currently ${endpointUrl}.`,
	jevApiKeyMissing: "A JEV review needs an API key.",
	jevInvalidResponse: "The JEV review response is invalid.",
	jevHttpError: (status, detail, endpoint) =>
		`The review service returned HTTP ${status}${detail ? `: ${detail}` : ""} (${endpoint}).`,
	jevUnreachable: (endpoint) => `Cannot reach the review service (${endpoint}).`,
	jevPassed: "JEV judged it safe to run.",
	jevNeedsReview: "JEV requires human review.",
};

/** 取指定语言的文案。 */
export function messagesFor(language: Language): Messages {
	return language === "en" ? EN : ZH_CN;
}
