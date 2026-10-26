import { describe, expect, test } from "bun:test";
import {
  REVIEW_CONFIRMATION_NOTIFICATION,
  sendReviewNotification,
  shouldSendReviewNotification,
} from "../src/notification";

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
    sendReviewNotification({ sendNotification: (message) => sent.push(message) });

    expect(sent).toEqual([REVIEW_CONFIRMATION_NOTIFICATION]);
    expect(REVIEW_CONFIRMATION_NOTIFICATION.body).toBe("命令审核未通过，等待确认");
    expect(REVIEW_CONFIRMATION_NOTIFICATION.type).toBe("ask");
  });
});
