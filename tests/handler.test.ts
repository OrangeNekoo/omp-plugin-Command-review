import { describe, expect, test } from "bun:test";
import type { ExtensionContext, ExtensionUIContext, ToolCallEvent } from "@oh-my-pi/pi-coding-agent";
import { createToolCallHandler, type ToolCallHandler, type ToolCallHandlerDeps } from "../src/handler";
import type { ReviewConfig } from "../src/config";
import type { ReviewDecision } from "../src/policy";

/**
 * 驱动 tool_call 处理器的完整链路：审核不通过 → 推送等待选择通知 → 弹确认框。
 *
 * 审核模型调用、终端通知与确认框都由依赖注入替换，因此断言覆盖的是插件自身
 * 的行为，而不是审核服务的可达性。
 */

const BASE_SETTINGS: ReviewConfig = {
  api: "chat-completions",
  skipCommands: [],
  auditLogEnabled: false,
  thinkingEnabled: false,
  reviewTimeoutMs: 20_000,
  notifyEnabled: true,
};

interface Harness {
  handler: ToolCallHandler;
  notifications: number;
  selections: string[][];
  reviewedText: string[];
}

function createHarness(overrides: Partial<ToolCallHandlerDeps> = {}): Harness {
  const harness: Harness = {
    handler: async () => undefined,
    notifications: 0,
    selections: [],
    reviewedText: [],
  };
  const decision: ReviewDecision = { verdict: "review", reason: "需要人工确认" };
  harness.handler = createToolCallHandler({
    approvalMode: () => "yolo",
    toolCallTimeoutMs: () => 30_000,
    askNotify: () => "on",
    loadSettings: async () => BASE_SETTINGS,
    review: async (reviewText) => {
      harness.reviewedText.push(reviewText);
      return decision;
    },
    confirm: async (_ui: Pick<ExtensionUIContext, "select">, _title: string, message: string) => {
      harness.selections.push([message]);
      return true;
    },
    notify: () => {
      harness.notifications += 1;
    },
    ...overrides,
  });
  return harness;
}

function createContext(hasUI: boolean): ExtensionContext {
  return {
    cwd: "/tmp/omp-command-review-test",
    hasUI,
    ui: { select: async () => undefined },
  } as unknown as ExtensionContext;
}

function bashEvent(command: string): ToolCallEvent {
  return { toolName: "bash", input: { command } } as unknown as ToolCallEvent;
}

describe("tool call handler", () => {
  test("notifies the terminal before asking the user to confirm a failed review", async () => {
    const harness = createHarness();

    const result = await harness.handler(bashEvent("rm -rf build"), createContext(true));

    expect(harness.notifications).toBe(1);
    expect(harness.selections).toHaveLength(1);
    expect(harness.reviewedText).toEqual(["bash\nrm -rf build"]);
    expect(result).toBeUndefined();
  });

  test("stays silent and blocks without a dialog when no interactive UI exists", async () => {
    const harness = createHarness();

    const result = await harness.handler(bashEvent("rm -rf build"), createContext(false));

    expect(harness.notifications).toBe(0);
    expect(harness.selections).toHaveLength(0);
    expect(result).toMatchObject({ block: true });
  });

  test("does not notify when the plugin switch is off", async () => {
    const harness = createHarness({
      loadSettings: async () => ({ ...BASE_SETTINGS, notifyEnabled: false }),
    });

    await harness.handler(bashEvent("rm -rf build"), createContext(true));

    expect(harness.notifications).toBe(0);
    expect(harness.selections).toHaveLength(1);
  });

  test("does not notify when the host disables ask notifications", async () => {
    const harness = createHarness({ askNotify: () => "off" });

    await harness.handler(bashEvent("rm -rf build"), createContext(true));

    expect(harness.notifications).toBe(0);
    expect(harness.selections).toHaveLength(1);
  });

  test("does not intervene unless the host runs in yolo approval mode", async () => {
    const harness = createHarness({ approvalMode: () => "always-ask" });

    const result = await harness.handler(bashEvent("rm -rf build"), createContext(true));

    expect(harness.notifications).toBe(0);
    expect(harness.selections).toHaveLength(0);
    expect(harness.reviewedText).toEqual([]);
    expect(result).toBeUndefined();
  });

  test("blocks and explains the failure when the review model errors out", async () => {
    const harness = createHarness({
      review: async () => {
        throw new Error("审核服务不可用");
      },
    });

    const result = await harness.handler(bashEvent("rm -rf build"), createContext(true));

    expect(harness.notifications).toBe(0);
    expect(result).toMatchObject({ block: true });
  });

  test("blocks when the user refuses the confirmation", async () => {
    const harness = createHarness({
      confirm: async () => false,
    });

    const result = await harness.handler(bashEvent("rm -rf build"), createContext(true));

    expect(harness.notifications).toBe(1);
    expect(result).toMatchObject({ block: true });
  });
});
