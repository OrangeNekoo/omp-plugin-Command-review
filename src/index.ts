import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { TERMINAL } from "@oh-my-pi/pi-tui/terminal-capabilities";
import { confirmHighRiskCommand } from "./confirmation";
import { reviewToolCall } from "./review";
import { loadReviewConfig, type ReviewConfig } from "./config";
import { createToolCallHandler, DEFAULT_TOOL_CALL_TIMEOUT_MS } from "./handler";
import { readHostAskNotify, sendReviewNotification } from "./notification";

const PLUGIN_NAME = "omp-command-review";
const approvalModeSetting = lookup("tools.approvalMode");
const extensionHandlerTimeoutSetting = lookup("extensionHandlers.toolCallTimeoutMs");
const reviewSettingsByCwd = new Map<string, Promise<ReviewConfig>>();

export default function commandReviewExtension(pi: ExtensionAPI): void {
  const loadSettings = (cwd: string): Promise<ReviewConfig> => {
    let settingsPromise = reviewSettingsByCwd.get(cwd);
    if (!settingsPromise) {
      settingsPromise = getPluginSettings(PLUGIN_NAME, cwd).then((pluginSettings) =>
        loadReviewConfig(cwd, pluginSettings),
      );
      reviewSettingsByCwd.set(cwd, settingsPromise);
    }
    return settingsPromise;
  };

  pi.on("tool_call", createToolCallHandler({
    approvalMode: () => {
      const mode = approvalModeSetting?.get(pi.pi.settings);
      return typeof mode === "string" ? mode : undefined;
    },
    toolCallTimeoutMs: () => {
      const configured = extensionHandlerTimeoutSetting?.get(pi.pi.settings);
      return typeof configured === "number" ? configured : DEFAULT_TOOL_CALL_TIMEOUT_MS;
    },
    askNotify: () => readHostAskNotify(pi.pi.settings),
    loadSettings,
    review: reviewToolCall,
    confirm: confirmHighRiskCommand,
    notify: () => sendReviewNotification(TERMINAL),
  }));
}
