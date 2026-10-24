# omp-command-review

这是一个 oh-my-pi 扩展插件，不修改 oh-my-pi 源码。它在有效审批模式为 `yolo` 时拦截模型发起的 `bash` 工具调用：已知只读命令和用户配置的跳过项不调用模型，其余命令交给用户配置的 OpenAI-compatible 审核模型分类。模型判为低风险时放行；判为高风险时在交互界面显示风险原因和完整命令，由用户决定是否执行。

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

示例：

```yaml
endpointUrl: https://api.example.com/v1
api: chat-completions
model: gpt-4o-mini
apiKeyEnv: OMP_COMMAND_REVIEW_API_KEY
skipCommands:
  - "npm test*"
  - "pnpm lint"
```

支持的字段：

- `endpointUrl`：OpenAI-compatible API 根 URL。
- `api`：`chat-completions` 或 `responses`。
- `model`：审核模型 ID。
- `apiKey`：直接配置 key；不推荐写入文件。
- `apiKeyEnv`：从指定环境变量读取 key，推荐使用。
- `skipCommands`：glob 字符串数组，也支持逗号或换行分隔的字符串。

- `auditLogEnabled`：是否记录审核日志，默认 `false`。
- `thinkingEnabled`：是否启用审核模型思考模式，默认 `false`。

启用审核日志后，插件将每条实际发送给审核模型的命令及审核结果追加写入当前项目：

```text
<项目>/.omp/command-review-audit.jsonl
```

每行是一个 JSON 对象，包含时间、命令、API 格式、模型、是否启用思考、风险、原因和最终结果。日志默认关闭；日志写入失败不会放行或阻止命令，也不会影响审核流程。

配置文件示例：

```yaml
auditLogEnabled: true
thinkingEnabled: false
```

命令配置：

```sh
omp-zh plugin config set omp-command-review auditLogEnabled true
omp-zh plugin config set omp-command-review thinkingEnabled true
```

环境变量：

```sh
export OMP_COMMAND_REVIEW_AUDIT_LOG=true
export OMP_COMMAND_REVIEW_THINKING=true
```

思考模式使用 omp-zh 内置 `@oh-my-pi/pi-ai` 的自动策略：启用时不发送显式 effort，由服务端使用默认思考策略；`openai-responses` 使用服务端默认的 `reasoning` 行为，`openai-completions` 使用服务端默认的 `reasoning_effort` 行为。关闭时使用对应 API 的关闭推理参数，不直接拼接请求 JSON，因此两种 API 格式保持兼容。具体思考强度由审核服务和模型决定，不固定为 low/medium/high。

注意：审核日志可能包含命令中的路径、参数和敏感数据。启用前确认当前项目允许保存这些内容，并将 `.omp/command-review-audit.jsonl` 加入项目的忽略规则。

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

插件使用 omp-zh 复用的 `@oh-my-pi/pi-ai` `completeSimple`，发送单轮、无工具调用的 JSON 分类请求，不附带项目文件或会话历史。

## 审核行为

- 只拦截 `bash` 工具调用；`read`、`grep`、`glob`、`edit`、`write` 等独立工具调用不属于 shell 命令，不由此插件审核。
- 只在有效 `tools.approvalMode` 为 `yolo` 时启用。omp-zh 的 `tool_call` 事件不包含审批模式；插件通过 omp-zh 设置注册表读取有效的 `tools.approvalMode`，而不是等待 yolo 下不会触发的审批请求事件。
- 明确的只读命令（例如 `git status`、`rg`、`cat`、`npm list`）及仅由这些命令组成的命令链直接放行，不发送给模型。带写入重定向、shell 展开、未知程序或可能修改状态的命令不按只读处理。
- 其余 bash 命令发送给配置的审核模型。高风险结果需要 TUI 确认；模型调用失败、响应格式无效或高风险命令处于无交互界面时均阻止命令。
- 跳过规则对匹配命令无条件生效，用户需确保规则范围足够窄。命令以 glob 方式匹配完整命令文本，支持 `*`、`?` 和字符集合。

设置一个跳过规则示例：

```sh
omp-zh plugin config set omp-command-review skipCommands 'npm test*,pnpm lint'
```

也可使用 `OMP_COMMAND_REVIEW_SKIP_COMMANDS` 环境变量；多个 glob 用逗号或换行分隔。修改插件设置后，重启 omp-zh 会话以确保扩展和设置重新加载。

## 隐私与安全

除跳过项和本地识别的只读命令外，每条 bash 命令文本都会发送到配置的模型端点；审核调用会消耗该模型的 token。不要对不允许向该端点发送命令文本的项目启用本插件。审核模型是概率性分类器，不是沙箱；只允许可信的端点和插件代码。显式跳过项会绕开分类和确认。
