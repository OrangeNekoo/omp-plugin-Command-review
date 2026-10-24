# omp-command-review

这是一个 oh-my-pi 扩展插件，不修改 oh-my-pi 源码。它在有效审批模式为 `yolo` 时拦截模型发起的工具调用（`bash`、`read`、`write`、`edit`、`grep`、`glob` 及自定义工具）：用户配置的跳过项和本地识别的只读 shell 命令不调用模型，其余调用交给配置的审核模型判定。

审核结论只有两类：

| 结论 | 行为 |
| --- | --- |
| 通过 | 由 omp 直接执行 |
| 不通过 | 在交互界面显示审核原因和完整调用内容，交由用户审查决定 |

审核请求超时同样按“不通过”阻断，并把超时信息（超时预算、端点、模型、API 形态）作为阻断原因回传给工作中的模型，便于其调整后续操作。

## 安装

在插件目录执行：

```sh
omp-zh plugin install .
```

安装后重启 omp-zh。开发时也可用 `omp-zh --extension /绝对路径/omp-plugin-Command-review` 临时加载。

## 配置审核模型

插件支持配置文件、`omp-zh plugin config` 和环境变量。配置文件优先级高于命令设置：项目文件 > 全局文件 > `omp-zh plugin config` > 环境变量 > 默认值。

全局配置文件：`~/.omp/agent/command-review.yml`

项目配置文件：`<项目>/.omp/command-review.yml`

完整示例：

```yaml
endpointUrl: https://api.example.com/v1
api: chat-completions
model: gpt-4o-mini
apiKeyEnv: OMP_COMMAND_REVIEW_API_KEY
auditLogEnabled: true
thinkingEnabled: false
reviewTimeoutMs: 20000
skipCommands:
  - "read"
  - "grep"
  - "glob"
  - "edit"
  - "write"
  - "npm test*"
  - "pnpm lint"
```

`read`、`grep`、`glob`、`edit`、`write` 等只读或定点编辑工具不再写死在代码里：把工具名写进 `skipCommands` 即可跳过审核，删除条目即恢复审核。`skipCommands` 同时匹配**工具名**和**审核文本**（bash 为命令原文，其它工具为序列化入参），任一命中即跳过。工具名匹配要求完全相等或按 glob 命中，因此 `read` 不会误伤 `read_file` 之外的命令文本。

支持的字段：

- `endpointUrl`：审核服务根 URL。`api=jev` 时填服务根地址（例如 `https://www.dmxapi.cn`），插件自动拼接 `/typesafe/v1/systemone`；已经写成完整端点则原样使用。
- `api`：`chat-completions`、`responses` 或 `jev`。
- `model`：审核模型 ID；`api=jev` 时为 `jev-1.14.0` 这类 TypeSafe 模型名。
- `apiKey`：直接配置 key；不推荐写入文件。
- `apiKeyEnv`：从指定环境变量读取 key，推荐使用。
- `skipCommands`：glob 字符串数组，也支持逗号或换行分隔的字符串。
- `auditLogEnabled`：是否记录审核日志，默认 `false`。
- `thinkingEnabled`：是否启用审核模型思考模式，默认 `false`；仅对 `responses` 与 `chat-completions` 生效，`jev` 不使用该参数。
- `reviewTimeoutMs`：审核模型请求超时毫秒数，默认 `20000`；超过宿主扩展钩子预算时会自动缩短。

### 使用 jev（TypeSafe System One）

`jev` 不是 OpenAI 兼容接口，请求体由插件按 TypeSafe 官方格式构造：

```json
{
  "model": "jev-1.14.0",
  "state": "bash\nrm -rf ./build",
  "questions": {
    "decision": {
      "type": "choice",
      "instructions": "……判断这次工具调用是否可以直接执行，不需要人工确认。",
      "criteria": {
        "pass": "只读，或影响范围局限于当前项目且可逆；……",
        "review": "包含删除、覆盖……或后果不明确、需要人工判断。"
      }
    }
  }
}
```

模型返回 `answers.decision.choice` 为 `pass` 或 `review`，两者分别对应“通过”和“不通过”，插件不解析自由文本。响应结构缺失、`choice` 不在选项中或 HTTP 失败时按审核失败阻断。

```yaml
endpointUrl: https://www.dmxapi.cn
api: jev
model: jev-1.14.0
apiKeyEnv: OMP_COMMAND_REVIEW_API_KEY
skipCommands:
  - "read"
  - "grep"
  - "glob"
```

### 日志

启用 `auditLogEnabled` 后，插件把每次实际送审的调用及结论写入当前项目：

```text
<项目>/.omp/command-review-audit.json
```

文件是一个 JSON 数组，每次写入追加一个对象并整体原子替换，写入串行化以避免并发丢记录：

```json
[
  {
    "timestamp": "2026-10-24T00:00:00.000Z",
    "tool": "bash",
    "command": "rm -rf ./build",
    "input": "bash\nrm -rf ./build",
    "api": "jev",
    "model": "jev-1.14.0",
    "thinkingEnabled": false,
    "verdict": "review",
    "reason": "JEV 判定需要人工审查（置信度 0.98）。",
    "outcome": "blocked"
  }
]
```

`outcome` 取 `allowed`、`blocked`、`error`；超时记录为 `error` 并带上错误信息。日志默认关闭；写入失败不会放行或阻止命令，也不会影响审核流程。

命令配置：

```sh
omp-zh plugin config set omp-command-review auditLogEnabled true
omp-zh plugin config set omp-command-review thinkingEnabled true
omp-zh plugin config set omp-command-review reviewTimeoutMs 20000
```

环境变量：

```sh
export OMP_COMMAND_REVIEW_AUDIT_LOG=true
export OMP_COMMAND_REVIEW_THINKING=true
export OMP_COMMAND_REVIEW_TIMEOUT_MS=20000
```

思考模式使用 omp-zh 内置 `@oh-my-pi/pi-ai` 的自动策略：启用时不发送显式 effort，由服务端使用默认思考策略；`openai-responses` 使用服务端默认的 `reasoning` 行为，`openai-completions` 使用服务端默认的 `reasoning_effort` 行为。关闭时使用对应 API 的关闭推理参数，不直接拼接请求 JSON，因此两种 API 格式保持兼容。具体思考强度由审核服务和模型决定，不固定为 low/medium/high。

审核请求有独立截止时间，超时会中止请求、写入 `error` 审计结果并按“不通过”阻断，同时把超时明细回传给工作中的模型。实际请求上限取 `reviewTimeoutMs` 与 omp `extensionHandlers.toolCallTimeoutMs` 的 80% 中较小值（omp 默认钩子期限为 30000 毫秒）。要允许更长请求，先提高 `~/.omp/agent/config.yml` 中的钩子期限，再设置更小的插件超时，例如：

```yaml
# ~/.omp/agent/config.yml
extensionHandlers:
  toolCallTimeoutMs: 60000
```

```yaml
# <项目>/.omp/command-review.yml
reviewTimeoutMs: 45000
```

注意：审核日志可能包含命令、路径、参数和文件片段。启用前确认当前项目允许保存这些内容，并将 `.omp/command-review-audit.json` 加入项目的忽略规则。

也可以用 `${ENV_NAME}` 形式配置密钥：

```yaml
apiKey: ${OMP_COMMAND_REVIEW_API_KEY}
```

命令配置方式仍然兼容：

```sh
omp-zh plugin config set omp-command-review endpointUrl https://api.example.com/v1
omp-zh plugin config set omp-command-review api chat-completions
omp-zh plugin config set omp-command-review model your-model-id
omp-zh plugin config set omp-command-review apiKey 'your-api-key'
```

环境变量示例：

```sh
export OMP_COMMAND_REVIEW_URL='https://api.example.com/v1'
export OMP_COMMAND_REVIEW_MODEL='your-model-id'
export OMP_COMMAND_REVIEW_API_KEY='your-api-key'
```

## 审核行为

- 审核所有工具调用，工具范围不写死在代码里。`skipCommands` 中列出的工具名（如 `read`、`grep`、`glob`、`edit`、`write`）直接跳过。
- 只在有效 `tools.approvalMode` 为 `yolo` 时启用。omp-zh 的 `tool_call` 事件不包含审批模式；插件通过 omp-zh 设置注册表读取有效的 `tools.approvalMode`，而不是等待 yolo 下不会触发的审批请求事件。
- 只读 shell 命令（例如 `git status`、`rg`、`cat`、`npm list`）及仅由这些命令组成的命令链直接放行，不发送给模型。带写入重定向、shell 展开、未知程序或可能修改状态的命令不按只读处理。
- 模型结论只有“通过”和“不通过”两类。通过即执行；不通过时使用“是/否”选择确认，选择“是”才放行，取消、否定或无法识别的选项均按 fail-closed 阻止。模型调用失败、响应格式无效、超时或无交互界面时同样阻止，并把原因回传给工作中的模型。
- 非 bash 工具的审核文本为其入参 JSON，超过 8000 字符会截断并标注。
- 跳过规则对匹配项无条件生效，用户需确保规则范围足够窄。命令以 glob 方式匹配完整命令文本，支持 `*`、`?` 和字符集合。

设置跳过规则示例：

```sh
omp-zh plugin config set omp-command-review skipCommands 'read,grep,glob,edit,write,npm test*,pnpm lint'
```

也可使用 `OMP_COMMAND_REVIEW_SKIP_COMMANDS` 环境变量；多个 glob 用逗号或换行分隔。修改插件设置后，重启 omp-zh 会话以确保扩展和设置重新加载。

## 隐私与安全

除跳过项和本地识别的只读命令外，每个工具调用的文本都会发送到配置的模型端点；审核调用会消耗该模型的 token。不要对不允许向该端点发送调用内容的项目启用本插件。审核模型是概率性分类器，不是沙箱；只允许可信的端点和插件代码。显式跳过项会绕开审核和确认。
