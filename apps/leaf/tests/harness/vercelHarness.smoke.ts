// Live Vercel-harness smoke test — drives ONE message through the REAL vercel
// engine (creates a Vercel Sandbox, runs Claude Code, calls Autumn host tools).
//
// Creates real Vercel/Anthropic resources + spends tokens — run manually, never
// in CI. Needs a REACHABLE MCP_SERVER_URL (the NGROK tunnel, not localhost),
// VERCEL_TOKEN (+ team), ANTHROPIC_API_KEY, and a real org installation in the
// chat DB. Secrets load from Infisical + server/.env.local.
//
// Set SANDBOX_PROVIDER=daytona (+ DAYTONA_API_KEY) to drive the same flow through
// a Daytona sandbox instead of Vercel — the engine is sandbox-agnostic.
//   bun apps/leaf/tests/harness/vercelHarness.smoke.ts "list the plans"
//   bun apps/leaf/tests/harness/vercelHarness.smoke.ts --write "attach the scale plan to kp-customer-0100 now"
import type { ChatProvider } from "@autumn/shared";
import { initInfisical } from "@autumn/shared/utils/infisical";

await initInfisical();

const { AppEnv, chatInstallations } = await import("@autumn/shared");
const { and, eq } = await import("drizzle-orm");
const { vercelHarnessEngine } = await import(
	"../../src/agent/runMessage/engines/vercelHarnessEngine.js"
);
const { setupAgentToolContext } = await import(
	"../../src/agent/runMessage/setup/setupAgentToolContext.js"
);
const { getInstallationOAuthAccessToken } = await import(
	"../../src/internal/installations/actions/getInstallationOAuthAccessToken.js"
);
const { db } = await import("../../src/lib/db.js");
const { logger } = await import("../../src/lib/logger.js");

const main = async () => {
	const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const text = args[0] ?? "List the plans.";
	const env = process.env.SMOKE_ENV === "live" ? AppEnv.Live : AppEnv.Sandbox;
	const provider = (process.env.SMOKE_PROVIDER ?? "slack") as ChatProvider;

	const installation = process.env.SMOKE_ORG_ID
		? await db.query.chatInstallations.findFirst({
				where: and(
					eq(chatInstallations.org_id, process.env.SMOKE_ORG_ID),
					eq(chatInstallations.provider, provider),
					eq(
						chatInstallations.workspace_id,
						process.env.SMOKE_WORKSPACE_ID ?? "",
					),
				),
			})
		: await db.query.chatInstallations.findFirst({
				where: eq(chatInstallations.provider, provider),
			});
	if (!installation) {
		throw new Error(
			"No chat installation found (set SMOKE_ORG_ID or seed one)",
		);
	}
	logger.info("[smoke] using installation", {
		event: "leaf.smoke_installation",
		data: { org_id: installation.org_id, workspace: installation.workspace_id },
	});

	const token = await getInstallationOAuthAccessToken({ installation, env });
	const agentTools = await setupAgentToolContext({ env, logger, token });

	const output = await vercelHarnessEngine.run({
		ctx: {
			agentTools,
			env,
			id: crypto.randomUUID(),
			logger,
			onAction: (message) =>
				logger.info("[smoke] action", {
					event: "leaf.smoke_action",
					data: { message },
				}),
			org: { id: installation.org_id },
			providerUserId: "smoke",
			thread: {
				channelId: "smoke",
				provider,
				threadId: `smoke-${Date.now()}`,
				workspaceId: installation.workspace_id,
			},
			timestamp: Date.now(),
			token,
		},
		params: { text },
	});

	// Synchronous so the summary survives process.exit (logger flush is async).
	const print = (label: string, value: unknown) =>
		// biome-ignore lint/suspicious/noConsole: smoke-test result output.
		console.log(`\n===== ${label} =====\n${JSON.stringify(value, null, 2)}\n`);
	print("SMOKE RESULT", {
		finishReason: output.finishReason,
		hasPreview: Boolean(output.previewApproval),
		runId: output.runId,
		suspendedTool: output.suspendPayload?.toolName,
		suspendedToolCallId: output.suspendPayload?.toolCallId,
		suspendArgs: output.suspendPayload?.args,
		text: output.text?.slice(0, 1200),
	});

	// --resume: simulate the Slack "Approve" click → the dispatcher routes to the
	// vercel resumer, which continueStreams the approved write to completion.
	if (
		process.argv.includes("--resume") &&
		output.finishReason === "suspended" &&
		output.runId
	) {
		const { approveAndRun } = await import(
			"../../src/internal/approvals/actions/approveAndRun.js"
		);
		const result = await approveAndRun({
			approval: {
				env,
				harness: "vercel",
				id: `smoke-approval-${Date.now()}`,
				org_id: installation.org_id,
				provider,
				run_id: output.runId,
				tool_call_id: output.suspendPayload?.toolCallId ?? null,
				tool_name: output.suspendPayload?.toolName ?? "attach",
				workspace_id: installation.workspace_id,
				// biome-ignore lint/suspicious/noExplicitAny: smoke builds a partial approval.
			} as any,
			onProgress: (line) =>
				logger.info("[smoke] approve progress", {
					event: "leaf.smoke_approve",
					data: { line },
				}),
			providerUserId: "smoke",
		});
		print("RESUME RESULT", result);
	}
	process.exit(0);
};

main().catch((error) => {
	logger.error("[smoke] failed", error, { event: "leaf.smoke_failed" });
	process.exit(1);
});
