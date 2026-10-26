import { describe, expect, test } from "bun:test";
import { DEFAULT_LANGUAGE, isSupportedLanguage, messagesFor, resolveLanguage } from "../src/i18n";

describe("language resolution", () => {
  test("falls back to the default language for an unknown value", () => {
    expect(resolveLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage("fr")).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage("")).toBe(DEFAULT_LANGUAGE);
  });

  test("accepts the supported languages and their common spellings", () => {
    expect(resolveLanguage("zh-CN")).toBe("zh-CN");
    expect(resolveLanguage("zh")).toBe("zh-CN");
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage("EN")).toBe("en");
  });

  test("reports whether a value is a supported language", () => {
    expect(isSupportedLanguage("zh-CN")).toBe(true);
    expect(isSupportedLanguage("en")).toBe(true);
    expect(isSupportedLanguage("fr")).toBe(false);
  });
});

describe("message catalogues", () => {
  test("keeps the English catalogue free of Chinese text", () => {
    const serialized = JSON.stringify(messagesFor("en"), (_key, value) =>
      typeof value === "function" ? undefined : value,
    );

    expect(serialized).not.toMatch(/[一-龥]/);
  });

  test("keeps the two catalogues structurally identical", () => {
    const zh = Object.keys(messagesFor("zh-CN")).sort();
    const en = Object.keys(messagesFor("en")).sort();

    expect(en).toEqual(zh);
  });
});
