import type { ExtensionUIContext } from "@oh-my-pi/pi-coding-agent";

const AFFIRMATIVE_SELECTIONS: Record<string, true> = { 是: true, yes: true, y: true };

export async function confirmHighRiskCommand(
  ui: Pick<ExtensionUIContext, "select">,
  title: string,
  message: string,
): Promise<boolean> {
  const selected = await ui.select(`${title}\n${message}`, ["是", "否"]);
  return selected !== undefined && AFFIRMATIVE_SELECTIONS[selected.trim().toLowerCase()] === true;
}
