import { describe, expect, test } from "bun:test";
import { formatCommandBlock } from "../src/format";
import { messagesFor } from "../src/i18n";

const zh = messagesFor("zh-CN");
const en = messagesFor("en");

describe("command formatting", () => {
  test("indents the command and drops the redundant tool prefix", () => {
    expect(formatCommandBlock("bash\nrm -rf build", zh)).toBe("  rm -rf build");
  });

  test("indents every line of a multi-line command", () => {
    expect(formatCommandBlock("bash\ncd /tmp\nrm -rf build", zh)).toBe("  cd /tmp\n  rm -rf build");
  });

  test("keeps a non-bash payload intact", () => {
    expect(formatCommandBlock("edit\n{\"path\":\"a.txt\"}", zh)).toBe("  edit\n  {\"path\":\"a.txt\"}");
  });

  test("keeps Markdown syntax in the command as written", () => {
    const command = "echo 'a_b' `tick` *glob*";

    expect(formatCommandBlock(`bash\n${command}`, zh)).toBe(`  ${command}`);
  });

  test("truncates a very long command and notes the remaining lines", () => {
    const command = Array.from({ length: 30 }, (_value, index) => `line ${index}`).join("\n");

    const formatted = formatCommandBlock(`bash\n${command}`, zh);
    const lines = formatted.split("\n");

    expect(lines).toHaveLength(21);
    expect(lines[20]).toBe(`  ${zh.commandTruncated(10)}`);
  });

  test("reports the truncation in the configured language", () => {
    const command = Array.from({ length: 25 }, (_value, index) => `line ${index}`).join("\n");

    expect(formatCommandBlock(`bash\n${command}`, en)).toContain(en.commandTruncated(5));
  });
});
