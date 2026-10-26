import type { ExtensionUIContext } from "@oh-my-pi/pi-coding-agent";
import type { Messages } from "./i18n";

/** 各种语言下表示肯定的选择。 */
const AFFIRMATIVE_SELECTIONS: Record<string, true> = { 是: true, yes: true, y: true };

export async function confirmHighRiskCommand(
  ui: Pick<ExtensionUIContext, "select">,
  title: string,
  message: string,
  messages: Messages,
): Promise<boolean> {
  const selected = await ui.select(`${title}\n${message}`, [messages.approveOption, messages.rejectOption]);
  return selected !== undefined && AFFIRMATIVE_SELECTIONS[selected.trim().toLowerCase()] === true;
}
