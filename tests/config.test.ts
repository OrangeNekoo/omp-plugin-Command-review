import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getReviewTimeoutBudgetMs, loadReviewConfig } from "../src/config";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeConfigHome(): Promise<{ home: string; cwd: string }> {
  const home = await mkdtemp(path.join(os.tmpdir(), "omp-command-review-home-"));
  const cwd = await mkdtemp(path.join(os.tmpdir(), "omp-command-review-project-"));
  temporaryDirectories.push(home, cwd);
  return { home, cwd };
}

describe("review config files", () => {
  test("merges project, global, plugin, environment, and default values by field", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(home, ".omp", "agent"), { recursive: true });
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(
      path.join(home, ".omp", "agent", "command-review.yml"),
      "endpointUrl: https://global.example/v1\napi: responses\nmodel: global-model\napiKeyEnv: GLOBAL_REVIEW_KEY\nskipCommands:\n  - global-*\n",
    );
    await writeFile(
      path.join(cwd, ".omp", "command-review.yml"),
      "endpointUrl: https://project.example/v1\nskipCommands:\n  - project-*\n",
    );

    const config = await loadReviewConfig(
      cwd,
      { model: "plugin-model", api: "chat-completions", skipCommands: "plugin-*" },
      { home, env: { GLOBAL_REVIEW_KEY: "global-secret", OMP_COMMAND_REVIEW_MODEL: "env-model" } },
    );

    expect(config.endpointUrl).toBe("https://project.example/v1");
    expect(config.api).toBe("responses");
    expect(config.model).toBe("global-model");
    expect(config.apiKey).toBe("global-secret");
    expect(config.skipCommands).toEqual(["project-*"]);
  });

  test("lets a project apiKey override a lower-priority global apiKeyEnv", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(home, ".omp", "agent"), { recursive: true });
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(home, ".omp", "agent", "command-review.yml"), "apiKeyEnv: GLOBAL_REVIEW_KEY\n");
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "apiKey: project-secret\n");

    const config = await loadReviewConfig(cwd, {}, { home, env: {} });

    expect(config.apiKey).toBe("project-secret");
  });

  test("reads disabled audit logging and thinking by default", async () => {
    const { home, cwd } = await makeConfigHome();

    const config = await loadReviewConfig(cwd, {}, { home, env: {} });

    expect(config.auditLogEnabled).toBe(false);
    expect(config.thinkingEnabled).toBe(false);
  });

  test("enables review notifications by default", async () => {
    const { home, cwd } = await makeConfigHome();

    const config = await loadReviewConfig(cwd, {}, { home, env: {} });

    expect(config.notifyEnabled).toBe(true);
  });

  test("reads the review notification switch from the project configuration", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "notifyEnabled: false\n");

    const config = await loadReviewConfig(cwd, {}, { home, env: {} });

    expect(config.notifyEnabled).toBe(false);
  });

  test("reads the review notification switch from the environment", async () => {
    const { home, cwd } = await makeConfigHome();

    const config = await loadReviewConfig(cwd, {}, { home, env: { OMP_COMMAND_REVIEW_NOTIFY_ENABLED: "false" } });

    expect(config.notifyEnabled).toBe(false);
  });

  test("uses Simplified Chinese by default", async () => {
    const { home, cwd } = await makeConfigHome();

    const config = await loadReviewConfig(cwd, {}, { home, env: {} });

    expect(config.language).toBe("zh-CN");
  });

  test("reads the language from the project configuration", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "language: en\n");

    const config = await loadReviewConfig(cwd, {}, { home, env: {} });

    expect(config.language).toBe("en");
  });

  test("reads the language from the environment", async () => {
    const { home, cwd } = await makeConfigHome();

    const config = await loadReviewConfig(cwd, {}, { home, env: { OMP_COMMAND_REVIEW_LANGUAGE: "en" } });

    expect(config.language).toBe("en");
  });

  test("rejects an unsupported language instead of silently falling back", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "language: fr\n");

    await expect(loadReviewConfig(cwd, {}, { home, env: {} })).rejects.toThrow("language");
  });

  test("uses a bounded review timeout by default", async () => {
    const { home, cwd } = await makeConfigHome();

    const config = await loadReviewConfig(cwd, {}, { home, env: {} });

    expect(config.reviewTimeoutMs).toBe(20_000);
  });

  test("reads review timeout from the project configuration", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "reviewTimeoutMs: 15000\n");

    const config = await loadReviewConfig(cwd, {}, { home, env: {} });

    expect(config.reviewTimeoutMs).toBe(15_000);
  });

  test("keeps review requests inside the host tool-call deadline", () => {
    expect(getReviewTimeoutBudgetMs(60_000, 30_000)).toBe(24_000);
    expect(getReviewTimeoutBudgetMs(15_000, 30_000)).toBe(15_000);
    expect(getReviewTimeoutBudgetMs(60_000, 10_000)).toBe(8_000);
  });

  test("merges audit logging and thinking settings from plugin, global, and project sources", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(home, ".omp", "agent"), { recursive: true });
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(home, ".omp", "agent", "command-review.yml"), "auditLogEnabled: true\nthinkingEnabled: false\n");
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "thinkingEnabled: true\n");

    const config = await loadReviewConfig(
      cwd,
      { auditLogEnabled: false, thinkingEnabled: false },
      { home, env: { OMP_COMMAND_REVIEW_AUDIT_LOG: "true" } },
    );

    expect(config.auditLogEnabled).toBe(true);
    expect(config.thinkingEnabled).toBe(true);
  });

  test("rejects invalid boolean configuration", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "thinkingEnabled: maybe\n");

    await expect(loadReviewConfig(cwd, {}, { home, env: {} })).rejects.toThrow("thinkingEnabled");
  });

  test("uses apiKeyEnv and full environment placeholders without persisting secrets", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "apiKey: ${REVIEW_KEY}\nmodel: review-model\n");

    const config = await loadReviewConfig(cwd, {}, { home, env: { REVIEW_KEY: "secret-value" } });

    expect(config.apiKey).toBe("secret-value");
    expect(config.model).toBe("review-model");
  });

  test("rejects malformed config values instead of silently disabling review", async () => {
    const { home, cwd } = await makeConfigHome();
    await mkdir(path.join(cwd, ".omp"), { recursive: true });
    await writeFile(path.join(cwd, ".omp", "command-review.yml"), "api: invalid-api\n");

    await expect(loadReviewConfig(cwd, {}, { home, env: {} })).rejects.toThrow("api");
  });
});
