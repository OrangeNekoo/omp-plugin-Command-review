import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadReviewConfig } from "../src/config";

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
