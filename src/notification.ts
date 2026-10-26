import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import type { Settings } from "@oh-my-pi/pi-coding-agent";
import type { TerminalNotification } from "@oh-my-pi/pi-tui/terminal-capabilities";
import type { Messages } from "./i18n";

/**
 * 审核未通过、等待用户选择时推送的终端通知。
 *
 * 字段与 omp 原生 ask 工具的“等待输入”通知一致：`type: "ask"` 让支持 OSC 99
 * 的终端把它当作交互请求处理，`actions: "focus"` 允许终端在通知上直接聚焦
 * 会话，其余终端退化为一行 `标题: 正文` 文本。
 */
export function reviewConfirmationNotification(messages: Messages): TerminalNotification {
	return {
		title: "omp",
		body: messages.notificationBody,
		type: "ask",
		urgency: "normal",
		actions: "focus",
	};
}

/** 发送终端通知的对象；生产环境传入宿主的 `TERMINAL` 单例。 */
export interface NotificationSender {
	sendNotification(message: TerminalNotification): void;
}

export interface ReviewNotificationPolicy {
	/** 插件自身开关（`notifyEnabled`）。 */
	notifyEnabled: boolean;
	/** 宿主 omp 的 `ask.notify` 取值；未注册时为 `undefined`，按开启处理。 */
	hostAskNotify: string | undefined;
}

/**
 * 插件开关与宿主 `ask.notify` 都允许时才推送通知。
 *
 * 宿主把 `ask.notify` 设为 `off` 表示用户不想在任何等待输入的场景收到通知；
 * 插件自绘的确认窗口同属等待输入，因此一并遵守。宿主未注册该设置（无头模式
 * 等场景）时按开启处理，与该设置的默认值一致。
 */
export function shouldSendReviewNotification(policy: ReviewNotificationPolicy): boolean {
	return policy.notifyEnabled && policy.hostAskNotify !== "off";
}

/**
 * 读取宿主 omp 的 `ask.notify` 设置。
 *
 * 该设置在宿主的 `modes/settings.ts` 注册，宿主启动时加载；此处按需查询而
 * 不是在模块顶层缓存，避免插件先于该模块求值时读到空值。
 */
export function readHostAskNotify(settings: Settings): string | undefined {
	const setting = lookup("ask.notify");
	if (!setting) return undefined;
	const value = setting.get(settings);
	return typeof value === "string" ? value : undefined;
}

/** 发送一条审核确认通知。 */
export function sendReviewNotification(sender: NotificationSender, messages: Messages): void {
	sender.sendNotification(reviewConfirmationNotification(messages));
}
