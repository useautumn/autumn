import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { executeAutumnMcpTool } from "../../src/internal/autumnMcp/client.js";
import { getInstallationOAuthAccessToken } from "../../src/internal/installations/actions/getInstallationOAuthAccessToken.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const CUSTOMER = process.env.E2E_CUSTOMER ?? "leaf-0004";
const MARKER_POLICY =
	"POLICY (must follow): every plan attach MUST use a FINALIZED invoice — set invoice_mode.enabled true AND invoice_mode.finalize true on every attach request. Never use draft invoices.";

const installation = await findInstallationWithOrg("slack", WORKSPACE_ID);
if (!installation) throw new Error("no installation");
const providerUserId = installation.installed_by_provider_user_id ?? "";
const token = await getInstallationOAuthAccessToken({
	env: AppEnv.Sandbox,
	installation,
	orgId: installation.org_id,
});
const callTool = async (toolName: string, request: Record<string, unknown>) => {
	const result = (await executeAutumnMcpTool({
		args: { request },
		env: AppEnv.Sandbox,
		token,
		toolName,
	})) as { content?: Array<{ text?: string }> };
	return JSON.parse(result.content?.[0]?.text ?? "{}");
};

// The installation token lacks organisation:write, so the test writes notes
// where the API would: the agent_rules row.
const setNotes = async (notes: string) => {
	await db.execute(
		sql`insert into agent_rules (org_id, org_slug, entity_rules, credit_rules, notes)
			values (${installation.org_id}, ${"unit-test-org"}, ${"{}"}::jsonb, ${"{}"}::jsonb, ${notes})
			on conflict (org_id) do update set notes = excluded.notes`,
	);
};
const originalRules = await callTool("getAgentRules", {});
const originalNotes: string = originalRules.notes ?? "";
console.log(`original notes: ${JSON.stringify(originalNotes).slice(0, 80)}`);

let exitCode = 1;
try {
	await setNotes(MARKER_POLICY);
	const verify = await callTool("getAgentRules", {});
	if (!String(verify.notes ?? "").includes("POLICY")) {
		throw new Error("marker notes did not persist");
	}
	console.log("marker policy set");

	const threadId = `orginstr-${Date.now().toString(36)}`;
	const target = {
		post: async (content: unknown) => {
			const postable = content as {
				getPostData?: () => { stream: AsyncIterable<unknown> };
				kind?: string;
			};
			if (postable?.kind === "stream" && postable.getPostData) {
				for await (const _ of postable.getPostData().stream) {
				}
			}
			return { id: "msg-1" };
		},
		startTyping: async () => {},
	};
	const ticker = createStatusTicker(target);
	const presenter = createEveSlackPresenter({ setStatus: ticker.activity });
	const output = await runSlackAgentTurn({
		channelId: threadId,
		installation,
		logger,
		onAction: (message) => presenter.onAction(message),
		onApprovalsSuperseded: () => {},
		onReasoning: presenter.onReasoning,
		onThinking: ticker.thinking,
		providerUserId,
		text: `attach the launch plan to ${CUSTOMER}`,
		threadId,
	});
	ticker.stop();

	const approval = (
		output as {
			approval?: { toolArgs: Record<string, unknown>; toolName: string };
			kind: string;
		}
	).approval;
	if (!approval) {
		console.log(`❌ no approval produced — kind=${output.kind}`);
	} else {
		const request = (approval.toolArgs as { request?: Record<string, unknown> })
			.request;
		const invoiceMode = (request?.invoice_mode ?? {}) as {
			enabled?: boolean;
			finalize?: boolean;
		};
		console.log(`parked invoice_mode: ${JSON.stringify(invoiceMode)}`);
		// The skill default is a DRAFT invoice (finalize false); only the org
		// policy demands finalized — so finalize=true proves the billing child
		// received and followed the org instructions.
		if (invoiceMode.enabled === true && invoiceMode.finalize === true) {
			console.log("✅ billing child followed the org policy");
			exitCode = 0;
		} else {
			console.log("❌ org policy ignored — expected finalize=true");
		}
	}
} finally {
	await setNotes(originalNotes);
	console.log("original notes restored");
}
process.exit(exitCode);
