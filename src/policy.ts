const READ_ONLY_COMMANDS: Record<string, true> = {
  basename: true, cat: true, cmp: true, column: true, cut: true, date: true, diff: true, dirname: true,
  du: true, echo: true, file: true, find: true, getconf: true, git: true, grep: true,
  head: true, id: true, jq: true, less: true, ls: true, man: true, md5: true, more: true, nl: true,
  npm: true, od: true, paste: true, printenv: true, printf: true, pwd: true, readlink: true,
  realpath: true, rg: true, sed: true, shasum: true, sort: true, stat: true, tail: true, tr: true,
  type: true, uniq: true, uname: true, wc: true, which: true, whoami: true,
};

const SAFE_GIT_SUBCOMMANDS: Record<string, true> = {
  branch: true, diff: true, grep: true, log: true, "ls-files": true, remote: true, "rev-parse": true,
  show: true, status: true, tag: true,
};

const SAFE_PACKAGE_MANAGER_READS: Record<string, Record<string, true>> = {
  npm: { audit: true, list: true, ls: true, outdated: true, view: true, info: true, help: true },
  pnpm: { audit: true, list: true, ls: true, outdated: true, view: true, info: true, why: true, help: true },
  yarn: { audit: true, info: true, list: true, why: true, help: true },
};


/** Split shell command lists and pipelines while rejecting shell execution/redirection syntax. */
function splitReadOnlySegments(command: string): string[] | null {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const next = command[i + 1];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      if (quote === '"' && (char === "$" || char === "`")) return null;
      if (char === quote) quote = undefined;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "$" || char === "`" || char === "<" || char === ">" || char === "(" || char === ")") {
      return null;
    }
    if (char === "&" && next !== "&") return null;
    if (char === ";" || char === "|" || char === "\n" || (char === "&" && next === "&") || (char === "|" && next === "|")) {
      const trimmed = current.trim();
      if (trimmed) segments.push(trimmed);
      else if (char !== "\n") return null;
      current = "";
      if ((char === "&" || char === "|") && next === char) i++;
      continue;
    }
    current += char;
  }

  if (quote || escaped) return null;
  const trimmed = current.trim();
  if (trimmed) segments.push(trimmed);
  return segments.length > 0 ? segments : null;
}

function tokenize(segment: string): string[] | null {
  const words: string[] = [];
  let word = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  let started = false;

  for (const char of segment) {
    if (escaped) {
      word += char;
      escaped = false;
      started = true;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else word += char;
      started = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) words.push(word);
      word = "";
      started = false;
      continue;
    }
    word += char;
    started = true;
  }

  if (quote || escaped) return null;
  if (started) words.push(word);
  return words;
}

function hasMutationFlag(args: string[]): boolean {
  return args.some((arg) => /^(?:--(?:fix|force|delete|exec|execdir|output|write|apply|set)|-(?:[a-zA-Z]*[fDis]|[fDis]))(?:=|$)/.test(arg));
}

function isReadOnlySegment(segment: string): boolean {
  const words = tokenize(segment);
  if (!words?.length) return false;
  const [program, ...args] = words;

  if (program === "git") {
    let commandIndex = 0;
    while (args[commandIndex] === "-C" && args[commandIndex + 1]) commandIndex += 2;
    const subcommand = args[commandIndex];
    if (!subcommand || !Object.hasOwn(SAFE_GIT_SUBCOMMANDS, subcommand)) return false;
    const commandArgs = args.slice(commandIndex + 1);
    if (hasMutationFlag(commandArgs)) return false;
    if (subcommand === "branch") {
      return commandArgs.every((arg) => ["-a", "-r", "-v", "-vv", "--all", "--remotes", "--verbose", "--list"].includes(arg));
    }
    if (subcommand === "tag") {
      return commandArgs.every((arg) => arg === "-l" || arg === "--list" || arg === "--sort" || arg.startsWith("--sort="));
    }
    if (subcommand === "remote") return commandArgs.every((arg) => arg === "-v" || arg === "--verbose");
    return true;
  }

  if (Object.hasOwn(SAFE_PACKAGE_MANAGER_READS, program)) {
    const subcommand = args[0];
    if (!subcommand || !Object.hasOwn(SAFE_PACKAGE_MANAGER_READS[program], subcommand) || hasMutationFlag(args.slice(1))) return false;
    return !args.slice(1).some((arg) => arg === "--global-install" || arg === "--add");
  }

  if (!Object.hasOwn(READ_ONLY_COMMANDS, program) || hasMutationFlag(args)) return false;
  if (program === "file" && args.some((arg) => arg === "-C" || arg === "--compile")) return false;
  if (program === "date" && args.some((arg) => arg === "-s" || arg === "--set" || arg.startsWith("--set="))) return false;
  if (program === "find" && args.some((arg) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fls", "-fprint", "-fprint0", "-fprintf"].includes(arg))) return false;
  if ((program === "which" || program === "type") && args.some((arg) => arg.startsWith("-") && arg !== "-a" && arg !== "-t")) return false;
  return true;
}

export function isReadOnlyCommand(command: string): boolean {
  const segments = splitReadOnlySegments(command);
  return segments !== null && segments.every(isReadOnlySegment);
}

export function parseSkipPatterns(value: string | undefined): string[] {
  return value?.split(/[\n,]/).map((pattern) => pattern.trim()).filter(Boolean) ?? [];
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else if (char === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end < 0) source += "\\[";
      else {
        const body = pattern.slice(i + 1, end);
        source += `[${body.startsWith("!") ? "^" + body.slice(1) : body}]`;
        i = end;
      }
    } else source += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

export function commandMatchesSkipPattern(command: string, patterns: string[]): boolean {
  const normalized = command.trim();
  return patterns.some((pattern) => {
    try {
      return globToRegExp(pattern.trim()).test(normalized);
    } catch {
      return false;
    }
  });
}

export interface ReviewDecision {
  risk: "high" | "low";
  reason: string;
}

export function parseReviewDecision(response: string): ReviewDecision | null {
  const normalized = response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value: unknown = JSON.parse(normalized);
    if (typeof value !== "object" || value === null) return null;
    const decision = value as { risk?: unknown; reason?: unknown };
    if ((decision.risk !== "high" && decision.risk !== "low") || typeof decision.reason !== "string") return null;
    const reason = decision.reason.trim();
    if (!reason || reason.length > 2000) return null;
    return { risk: decision.risk, reason };
  } catch {
    return null;
  }
}
