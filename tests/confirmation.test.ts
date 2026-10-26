import { describe, expect, test } from "bun:test";
import { confirmHighRiskCommand } from "../src/confirmation";
import { messagesFor } from "../src/i18n";

describe("high-risk command confirmation", () => {
  test("treats the localized affirmative selection as approval", async () => {
    const zh = messagesFor("zh-CN");
    const approved = await confirmHighRiskCommand(
      { select: async () => zh.approveOption },
      "命令审核未通过",
      "是否继续执行？",
      zh,
    );

    expect(approved).toBe(true);
  });

  test("treats the English affirmative selection as approval", async () => {
    const en = messagesFor("en");
    const approved = await confirmHighRiskCommand(
      { select: async () => en.approveOption },
      "Command review failed",
      "Continue?",
      en,
    );

    expect(approved).toBe(true);
  });

  test("blocks the negative selection", async () => {
    const zh = messagesFor("zh-CN");
    const approved = await confirmHighRiskCommand(
      { select: async () => zh.rejectOption },
      "命令审核未通过",
      "是否继续执行？",
      zh,
    );

    expect(approved).toBe(false);
  });

  test("blocks when the selection is cancelled", async () => {
    const zh = messagesFor("zh-CN");
    const approved = await confirmHighRiskCommand(
      { select: async () => undefined },
      "命令审核未通过",
      "是否继续执行？",
      zh,
    );

    expect(approved).toBe(false);
  });
});
