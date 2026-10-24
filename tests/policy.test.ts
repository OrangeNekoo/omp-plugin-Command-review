import { describe, expect, test } from "bun:test";
import {
  commandMatchesSkipPattern,
  isReadOnlyCommand,
  parseReviewDecision,
  parseSkipPatterns,
} from "../src/policy";

describe("command policy", () => {
  test("recognizes a simple read command without inspecting it", () => {
    expect(isReadOnlyCommand("git status --short")).toBe(true);
    expect(isReadOnlyCommand("rg -n 'TODO' src")).toBe(true);
  });

  test("does not classify a compound command as read-only when one segment mutates", () => {
    expect(isReadOnlyCommand("git status && rm -rf ./build")).toBe(false);
    expect(isReadOnlyCommand("cat package.json | npm install")).toBe(false);
  });

  test("treats mutations, shell expansion, and redirection as commands requiring review", () => {
    expect(isReadOnlyCommand("npm install -g typescript")).toBe(false);
    expect(isReadOnlyCommand("git branch -D old-work")).toBe(false);
    expect(isReadOnlyCommand("find . -delete")).toBe(false);
    expect(isReadOnlyCommand("find . -fprint /tmp/files.txt")).toBe(false);
    expect(isReadOnlyCommand("env rm -rf ./build")).toBe(false);
    expect(isReadOnlyCommand("echo \"$(rm -rf build)\"")).toBe(false);
    expect(isReadOnlyCommand("git status > status.txt")).toBe(false);
    expect(isReadOnlyCommand("date -s 00:00:00")).toBe(false);
    expect(isReadOnlyCommand("date --set 00:00:00")).toBe(false);
    expect(isReadOnlyCommand("file -C")).toBe(false);
    expect(isReadOnlyCommand("bun pm trust")).toBe(false);
  });

  test("rejects incomplete and unsupported risk decisions", () => {
    expect(parseReviewDecision('{"risk":"critical","reason":"unknown"}')).toBeNull();
    expect(parseReviewDecision('{"risk":"high","reason":"  "}')).toBeNull();
  });

  test("parses comma and newline separated skip patterns", () => {
    expect(parseSkipPatterns("git status*,\n pnpm lint")).toEqual(["git status*", "pnpm lint"]);
  });

  test("matches configured glob patterns against the complete normalized command", () => {
    expect(commandMatchesSkipPattern("npm test -- --runInBand", ["npm test*"])).toBe(true);
    expect(commandMatchesSkipPattern("npm install", ["npm test*"])).toBe(false);
  });

  test("accepts only a high-risk decision from a model response", () => {
    expect(parseReviewDecision('{"risk":"high","reason":"recursive deletion"}')).toEqual({
      risk: "high",
      reason: "recursive deletion",
    });
    expect(parseReviewDecision("not json")).toBeNull();
    expect(parseReviewDecision('{"risk":"low","reason":"read-only"}')).toEqual({
      risk: "low",
      reason: "read-only",
    });
  });
});
