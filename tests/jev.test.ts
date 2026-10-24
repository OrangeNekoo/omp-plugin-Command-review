import { describe, expect, test } from "bun:test";
import { buildJevRequest, parseJevResponse, resolveJevEndpoint } from "../src/jev";

describe("jev adapter", () => {
  test("builds a single choice question that can only answer pass or review", () => {
    const request = buildJevRequest("jev-1.14.0", "bash\nrm -rf ./build");

    expect(request.model).toBe("jev-1.14.0");
    expect(request.state).toBe("bash\nrm -rf ./build");
    const questions = request.questions as Record<string, { type: string; criteria: Record<string, string> }>;
    const question = questions.decision;
    expect(question?.type).toBe("choice");
    expect(Object.keys(question?.criteria ?? {})).toEqual(["pass", "review"]);
  });

  test("derives the TypeSafe endpoint from supported URL shapes", () => {
    expect(resolveJevEndpoint("https://www.dmxapi.cn")).toBe("https://www.dmxapi.cn/typesafe/v1/systemone");
    expect(resolveJevEndpoint("https://www.dmxapi.cn/")).toBe("https://www.dmxapi.cn/typesafe/v1/systemone");
    expect(resolveJevEndpoint("https://api.typesafe.ai/v1")).toBe("https://api.typesafe.ai/v1/systemone");
    expect(resolveJevEndpoint("https://api.typesafe.ai/v1/systemone")).toBe("https://api.typesafe.ai/v1/systemone");
  });

  test("refuses an endpoint it cannot map instead of guessing", () => {
    expect(() => resolveJevEndpoint("https://api.example.com/v1/chat")).toThrow("endpointUrl");
  });

  test("maps choice answers to the two review verdicts", () => {
    const pass = parseJevResponse({
      answers: { decision: { type: "choice", choice: "pass", confidence: 0.93 } },
      model: "jev-1.14.0",
    });
    expect(pass?.verdict).toBe("pass");
    expect(pass?.reason).toContain("0.93");

    const review = parseJevResponse({
      answers: { decision: { type: "choice", choice: "review", confidence: 0.51 } },
    });
    expect(review?.verdict).toBe("review");
  });

  test("rejects malformed or unexpected TypeSafe responses", () => {
    expect(parseJevResponse(undefined)).toBeNull();
    expect(parseJevResponse({})).toBeNull();
    expect(parseJevResponse({ answers: {} })).toBeNull();
    expect(parseJevResponse({ answers: { decision: { type: "noul", noul: 0.9 } } })).toBeNull();
    expect(parseJevResponse({ answers: { decision: { type: "choice", choice: "maybe" } } })).toBeNull();
  });
});
