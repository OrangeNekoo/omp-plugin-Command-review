import { describe, expect, test } from "bun:test";
import {
  reviewConfirmationNotification,
  sendReviewNotification,
  shouldSendReviewNotification,
} from "../src/notification";
import { messagesFor } from "../src/i18n";

describe("review notification", () => {
  test("notifies while both the plugin switch and the host ask.notify allow it", () => {
    expect(shouldSendReviewNotification({ notifyEnabled: true, hostAskNotify: "on" })).toBe(true);
    expect(shouldSendReviewNotification({ notifyEnabled: true, hostAskNotify: undefined })).toBe(true);
  });

  test("stays silent when the plugin switch is off", () => {
    expect(shouldSendReviewNotification({ notifyEnabled: false, hostAskNotify: "on" })).toBe(false);
  });

  test("stays silent when the host disables ask notifications", () => {
    expect(shouldSendReviewNotification({ notifyEnabled: true, hostAskNotify: "off" })).toBe(false);
  });

  test("sends the review confirmation notification through the given sender", () => {
    const sent: unknown[] = [];
    sendReviewNotification({ sendNotification: (message) => sent.push(message) }, messagesFor("zh-CN"));

    expect(sent).toEqual([
      {
        title: "omp",
        body: "命令审核未通过，等待确认",
        type: "ask",
        urgency: "normal",
        actions: "focus",
      },
    ]);
  });

  test("uses the configured language in the notification body", () => {
    const en = messagesFor("en");

    expect(reviewConfirmationNotification(en).body).toBe("Command review failed, waiting for confirmation");
    expect(reviewConfirmationNotification(messagesFor("zh-CN")).body).toBe("命令审核未通过，等待确认");
  });
});
