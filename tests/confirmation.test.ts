import { describe, expect, test } from "bun:test";
import { confirmHighRiskCommand } from "../src/confirmation";

describe("high-risk command confirmation", () => {
  test("treats the localized affirmative selection as approval", async () => {
    const approved = await confirmHighRiskCommand(
      { select: async () => "是" },
      "高危命令审核",
      "是否继续执行？",
    );

    expect(approved).toBe(true);
  });

  test("blocks the negative selection", async () => {
    const approved = await confirmHighRiskCommand(
      { select: async () => "否" },
      "高危命令审核",
      "是否继续执行？",
    );

    expect(approved).toBe(false);
  });
});
