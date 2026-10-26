import type { Messages } from "./i18n";

/**
 * 确认框里待执行内容的排版。
 *
 * 确认框的标题行会被折叠成一行并走行内 Markdown，其余行按纯文本逐行输出，
 * 因此命令放在首行之后可以原样显示：命令里的 `_`、`*`、反引号不会被当成
 * Markdown 语法。命令统一缩进两格，与「即将执行」标签形成层级。
 */

/** 命令块的缩进。 */
const COMMAND_INDENT = "  ";

/** 审核文本里工具名与内容的分隔标记。 */
const TOOL_PREFIX = "bash\n";

/** 单条命令允许的最大行数；超出部分以省略标记收尾。 */
const MAX_COMMAND_LINES = 20;

/**
 * 排版待执行内容：标签后跟缩进的命令块。
 *
 * bash 命令去掉重复的 `bash` 前缀（标签已经说明这是命令），多行命令逐行
 * 缩进；过长时截断并标注剩余行数，避免把确认框撑到看不完。
 */
export function formatCommandBlock(reviewText: string, messages: Messages): string {
	const body = reviewText.startsWith(TOOL_PREFIX) ? reviewText.slice(TOOL_PREFIX.length) : reviewText;
	const lines = body.split(/\r?\n/);
	const shown = lines.slice(0, MAX_COMMAND_LINES);
	const omitted = lines.length - shown.length;
	const rendered = shown.map(line => `${COMMAND_INDENT}${line}`);
	if (omitted > 0) rendered.push(`${COMMAND_INDENT}${messages.commandTruncated(omitted)}`);
	return rendered.join("\n");
}
