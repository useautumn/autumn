/** After an approved id rename, a follow-up write in the SAME thread targets
 * the NEW id.
 *   bun tests/e2e/staleIdRename.e2e.ts */
import { AppEnv } from "@autumn/shared";
import { createApproval } from "../../src/internal/approvals/actions/createApproval.js";
import { resolveApproval } from "../../src/internal/approvals/actions/resolveApproval.js";
import { chatApprovalRepo } from "../../src/internal/approvals/repos/chatApprovalRepo.js";
import { executeAutumnMcpTool } from "../../src/internal/autumnMcp/client.js";
import { getInstallationOAuthAccessToken } from "../../src/internal/installations/actions/getInstallationOAuthAccessToken.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import type { SlackChatInstallation } from "../../src/providers/slack/domain/slackAgentTurn.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail?: string) => {
	results.push({ name, ok });
	console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const installation = (await findInstallationWithOrg(
	"slack",
	WORKSPACE_ID,
)) as SlackChatInstallation | null;
if (!installation) throw new Error(`No slack installation for ${WORKSPACE_ID}`);
const providerUserId = installation.installed_by_provider_user_id ?? "";
const token = await getInstallationOAuthAccessToken({
	env: AppEnv.Sandbox,
	installation,
	orgId: installation.org_id,
});

const tag = Date.now().toString(36);
const oldId = `stale-${tag}-a`;
const newId = `stale-${tag}-renamed`;
await executeAutumnMcpTool({
	args: {
		intent: "stale id validation",
		request: { customer_id: oldId, email: `${oldId}@example.com` },
	},
	env: AppEnv.Sandbox,
	token,
	toolName: "getOrCreateCustomer",
});

const threadId = `stale-${tag}`;
const runTurn = (text: string) =>
	runSlackAgentTurn({
		channelId: threadId,
		installation,
		logger,
		onAction: () => {},
		onReasoning: () => {},
		onThinking: () => {},
		providerUserId,
		text,
		threadId,
	});

const renameTurn = await runTurn(
	`Change the id of customer ${oldId} to ${newId}.`,
);
if (renameTurn.kind !== "approval") {
	throw new Error(`rename turn kind ${renameTurn.kind}`);
}
const renameArgs = JSON.stringify(renameTurn.approval.toolArgs);
check("rename write targets the old id", renameArgs.includes(oldId));

const created = await createApproval({
	channelId: threadId,
	env: AppEnv.Sandbox,
	getToken: async () => token,
	logger,
	orgId: installation.org_id,
	provider: installation.provider,
	providerUserId,
	turn: {
		approval: renameTurn.approval,
		sessionId: renameTurn.sessionId,
	} as never,
	workspaceId: installation.workspace_id,
});
if (!created) throw new Error("no rename approval created");
const claimed = await chatApprovalRepo.claim({
	approvalId: created.approvalId,
	db,
	providerUserId,
});
if (!claimed) throw new Error("rename claim failed");
const resolved = await resolveApproval({ approval: claimed, providerUserId });
check(
	"rename approve applied via eve",
	!("drifted" in resolved) && !("error" in resolved),
	JSON.stringify(resolved).slice(0, 160),
);

const oldGone = JSON.stringify(
	await executeAutumnMcpTool({
		args: { intent: "verify", request: { customer_id: oldId } },
		env: AppEnv.Sandbox,
		token,
		toolName: "getCustomer",
	}),
).includes("customer_not_found");
check("old id no longer resolves", oldGone);

const followUpTurn = await runTurn(
	"now update this customer's name to Validation Check",
);
if (followUpTurn.kind !== "approval") {
	throw new Error(`follow-up turn kind ${followUpTurn.kind}`);
}
const followUpArgs = JSON.stringify(followUpTurn.approval.toolArgs);
check(
	"follow-up write targets the NEW id",
	followUpArgs.includes(newId) && !followUpArgs.includes(`"${oldId}"`),
	followUpArgs.slice(0, 300),
);

process.exit(results.every((entry) => entry.ok) ? 0 : 1);
