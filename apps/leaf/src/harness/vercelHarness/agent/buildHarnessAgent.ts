import { HarnessAgent } from "@ai-sdk/harness/agent";
import type { AppEnv } from "@autumn/shared";
import type { ToolSet } from "ai";
import { buildAdapter } from "./adapter.js";
import { buildSandboxProvider } from "./sandbox.js";

// Autumn tools run on the host (toolApproval gates destructive ones); the
// sandbox is the agent's compute (reasoning + built-in bash/file tools). The
// Autumn secret never enters the sandbox.
export const buildLeafHarnessAgent = async ({
	destructiveTools,
	env,
	instructions,
	token,
	tools,
}: {
	destructiveTools: Set<string>;
	env: AppEnv;
	instructions: string;
	token: string;
	tools: ToolSet;
}) =>
	new HarnessAgent({
		harness: buildAdapter(),
		// Forward bridge/CLI diagnostics to stderr when debugging sandbox issues.
		...(process.env.HARNESS_DEBUG ? { debug: { enabled: true } } : {}),
		instructions,
		// Built-in sandbox tools run freely; destructive Autumn tools suspend the
		// turn for a Slack approval card via the harness's first-class flow.
		permissionMode: "allow-all",
		sandbox: await buildSandboxProvider({ env, token }),
		toolApproval: Object.fromEntries(
			[...destructiveTools].map((name) => [name, "user-approval" as const]),
		),
		tools,
	});
