> [免责说明](DISCLAIMER.zh-CN.md) · [Disclaimer](DISCLAIMER.md)

# Disclaimer

`omp-command-review` (the “plugin”) is released under the MIT License, provided “as is”, without warranty of any kind, express or implied. The full terms are in [LICENSE](LICENSE).

## Not a security control

The plugin asks a review model to classify tool calls. Model output can be wrong: it can miss a dangerous call or flag a safe one. It provides no sandbox, privilege isolation, syscall filtering, or behavioral auditing, and it does not replace containers, virtual machines, least-privilege accounts, or human review. Enabling `yolo` approval mode means you have removed omp's per-call confirmation; the plugin adds one more judgment on top and does not change the risk of that decision.

## Review requests leave the machine

Except for configured skips and locally recognized read-only commands, the text of each tool call is sent to the endpoint you configure. That text may contain file paths, command arguments, code fragments, key names, or other sensitive content. The endpoint is your choice; its availability, logging, and data handling are controlled by that provider, not by this project, and this project makes no guarantee about them. Review calls consume the model's tokens and incur cost.

## Logs may contain sensitive content

With audit logging enabled, records go to `.omp/command-review-audit.json` inside the project, including raw commands and tool input. The file is not encrypted and may be committed or read by other tools. Whether to log, and how long to keep and when to delete it, is up to the user.

## Scope of the verdict

A verdict is either pass or fail, because the decision has to collapse into an executable branch. It is not a complete security assessment. “Pass” only means the configured model found no feature requiring human involvement. Skip patterns, read-only detection, and timeout handling can each be bypassed by specific inputs or triggered by mistake, so the user is responsible for keeping those rules narrow and correct.

## Limitation of liability

To the extent permitted by law, the authors and contributors are not liable for any direct or indirect loss arising from the use of, or inability to use, this plugin, including but not limited to data loss, system damage, service interruption, charges, and security incidents. Whether to use the plugin, how to use it, and in which projects to enable it are decisions for the user, who bears the consequences.
