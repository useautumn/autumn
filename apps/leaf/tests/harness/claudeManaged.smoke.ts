// Live CMA smoke test — drives ONE message through the REAL Claude Managed engine.
// This is the only way to exercise CMA: it creates a managed agent (visible in the
// Console → Managed Agents → Agents), the org's credential vault, and a session,
// and emits Braintrust per-thread traces. Evals can't do this — they run the agent
// in-process against a localhost mock MCP, which Anthropic's cloud loop can't reach.
//
// Creates real Anthropic resources + spends tokens — run manually, never in CI.
// Requires a REACHABLE MCP_SERVER_URL (a deployed Autumn MCP, NOT the localhost
// mock), ANTHROPIC_API_KEY, BRAINTRUST_API_KEY (for traces), and a real org
// installation in the chat DB:
//
//   MCP_SERVER_URL=https://api.useautumn.com \
//   SMOKE_ORG_ID=org_... SMOKE_WORKSPACE_ID=T... SMOKE_PROVIDER=slack \
//   bun apps/leaf/tests/harness/claudeManaged.smoke.ts "List my customers."
import { AppEnv, type ChatProvider, chatInstallations } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { claudeManagedEngine } from "../../src/agent/runMessage/engines/claudeManagedEngine.js";
import { getInstallationOAuthAccessToken } from "../../src/internal/installations/actions/getInstallationOAuthAccessToken.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";

const required = (name: string) => {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var ${name}`);
	return value;
};

const main = async () => {
	const orgId = required("SMOKE_ORG_ID");
	const workspaceId = required("SMOKE_WORKSPACE_ID");
	const provider = (process.env.SMOKE_PROVIDER ?? "slack") as ChatProvider;
	const env = process.env.SMOKE_ENV === "live" ? AppEnv.Live : AppEnv.Sandbox;
	const text = process.argv[2] ?? "List my customers.";

	const installation = await db.query.chatInstallations.findFirst({
		where: and(
			eq(chatInstallations.org_id, orgId),
			eq(chatInstallations.provider, provider),
			eq(chatInstallations.workspace_id, workspaceId),
		),
	});
	if (!installation)
		throw new Error(`No ${provider} installation for ${orgId}`);

	const token = await getInstallationOAuthAccessToken({ installation, env });

	const output = await claudeManagedEngine.run({
		ctx: {
			// Unused by the CMA engine (it fetches docs/tools when ensuring the agent).
			agentTools: { destructiveTools: new Set(), docsText: "" },
			env,
			id: crypto.randomUUID(),
			logger,
			onAction: (message) =>
				logger.info("[smoke] action", {
					event: "leaf.smoke_action",
					data: { message },
				}),
			org: { id: orgId },
			thread: {
				channelId: "smoke",
				provider,
				threadId: `smoke-${Date.now()}`,
				workspaceId,
			},
			timestamp: Date.now(),
			token,
		},
		params: { text },
	});

	logger.info("[smoke] done", {
		event: "leaf.smoke_done",
		data: {
			finish_reason: output.finishReason,
			run_id: output.runId,
			text: output.text?.slice(0, 800),
		},
	});
	process.exit(0);
};

main().catch((error) => {
	logger.error("[smoke] failed", error, { event: "leaf.smoke_failed" });
	process.exit(1);
});
