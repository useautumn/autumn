/**
 * The deterministic executor: approve executes the stored writes directly —
 * fast, exactly-once, drift-guarded — and eve is only notified.
 *
 *   bun tests/e2e/approveExecutor.e2e.ts
 */
import { AppEnv, chatApprovals, chatApprovalWrites } from "@autumn/shared";
import { eq } from "drizzle-orm";
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
const customerA = `exec-${tag}-a`;
const customerB = `exec-${tag}-b`;
for (const customerId of [customerA, customerB]) {
	await executeAutumnMcpTool({
		args: {
			intent: "executor e2e",
			request: { customer_id: customerId, email: `${customerId}@example.com` },
		},
		env: AppEnv.Sandbox,
		token,
		toolName: "getOrCreateCustomer",
	});
}

const parkGroupedAttach = async () => {
	const threadId = `exec-${Date.now().toString(36)}`;
	const turn = await runSlackAgentTurn({
		channelId: threadId,
		installation,
		logger,
		onAction: () => {},
		onApprovalsSuperseded: () => {},
		onReasoning: () => {},
		onThinking: () => {},
		providerUserId,
		text: `Attach the launch plan to both ${customerA} and ${customerB}. Issue both attach writes together in ONE tool batch.`,
		threadId,
	});
	if (turn.kind !== "approval") throw new Error(`turn kind ${turn.kind}`);
	const created = await createApproval({
		channelId: threadId,
		env: AppEnv.Sandbox,
		getToken: async () => token,
		logger,
		orgId: installation.org_id,
		provider: installation.provider,
		providerUserId,
		turn: { approval: turn.approval, sessionId: turn.sessionId } as never,
		workspaceId: installation.workspace_id,
	});
	if (!created) throw new Error("no approval created");
	await created.backfillGroupedPreviews?.();
	const approval = await chatApprovalRepo.get({
		approvalId: created.approvalId,
		db,
	});
	if (!approval) throw new Error("approval row missing");
	return approval;
};

const customerHasLaunch = async (customerId: string) =>
	JSON.stringify(
		await executeAutumnMcpTool({
			args: { intent: "verify", request: { customer_id: customerId } },
			env: AppEnv.Sandbox,
			token,
			toolName: "getCustomer",
		}),
	).includes("launch");

const requireApplied = (label: string, result: unknown) => {
	const text = JSON.stringify(result);
	if (text.includes('"isError":true') || text.includes("errorMessage")) {
		throw new Error(`${label} failed: ${text.slice(0, 300)}`);
	}
	if (text.includes("payment_url")) {
		throw new Error(`${label} redirected to checkout instead of applying`);
	}
};

const approval = await parkGroupedAttach();

// Concurrent double-click: the SQL claim admits exactly one.
const [claimA, claimB] = await Promise.all([
	chatApprovalRepo.claim({ approvalId: approval.id, db, providerUserId }),
	chatApprovalRepo.claim({ approvalId: approval.id, db, providerUserId }),
]);
check(
	"concurrent claims admit exactly one",
	[claimA, claimB].filter(Boolean).length === 1,
);

const claimed = claimA ?? claimB;
if (!claimed) throw new Error("no claim won");
let resumedOutcome: Record<string, unknown> | undefined;
const startedAt = Date.now();
const result = await resolveApproval({
	approval: claimed,
	onResumed: (resumed) => {
		resumedOutcome = resumed as Record<string, unknown>;
	},
	providerUserId,
});
const durationMs = Date.now() - startedAt;

check(
	"approve executed deterministically",
	!("drifted" in result) && !("error" in result),
	JSON.stringify(result).slice(0, 200),
);
check("approve→applied is fast", durationMs < 60_000, `${durationMs}ms total`);
check(
	"both customers received the plan (bulk)",
	(await customerHasLaunch(customerA)) && (await customerHasLaunch(customerB)),
);

const writes = await db
	.select()
	.from(chatApprovalWrites)
	.where(eq(chatApprovalWrites.approval_id, approval.id))
	.orderBy(chatApprovalWrites.position);
check(
	"every write row is applied",
	writes.length === 2 && writes.every((write) => write.status === "applied"),
	writes.map((write) => write.status).join(","),
);
const [finalRow] = await db
	.select()
	.from(chatApprovals)
	.where(eq(chatApprovals.id, approval.id));
check("row finalized approved", finalRow?.status === "approved");

// The eve notification resolves async, off the approve critical path. The
// model's text is never surfaced; only chained parks/questions would be.
await new Promise((resolve) => setTimeout(resolve, 45_000));
check(
	"async resume settled without re-issued writes",
	resumedOutcome !== undefined && !resumedOutcome.chainedApprovalId,
	JSON.stringify(resumedOutcome ?? {}).slice(0, 140),
);

// Re-click after apply: the claim refuses a decided row.
const reclaim = await chatApprovalRepo.claim({
	approvalId: approval.id,
	db,
	providerUserId,
});
check(
	"re-click after apply cannot reclaim",
	reclaim === undefined || reclaim === null,
);

// Drift: mutate state between card and approve — nothing may execute.
const driftTag = Date.now().toString(36);
const customerC = `exec-${driftTag}-c`;
await executeAutumnMcpTool({
	args: {
		intent: "executor e2e",
		request: { customer_id: customerC, email: `${customerC}@example.com` },
	},
	env: AppEnv.Sandbox,
	token,
	toolName: "getOrCreateCustomer",
});
const driftThread = `exec-drift-${driftTag}`;
const driftTurn = await runSlackAgentTurn({
	channelId: driftThread,
	installation,
	logger,
	onAction: () => {},
	onApprovalsSuperseded: () => {},
	onReasoning: () => {},
	onThinking: () => {},
	providerUserId,
	text: `Attach the launch plan to ${customerC}.`,
	threadId: driftThread,
});
if (driftTurn.kind !== "approval")
	throw new Error(`drift turn ${driftTurn.kind}`);
const driftCreated = await createApproval({
	channelId: driftThread,
	env: AppEnv.Sandbox,
	getToken: async () => token,
	logger,
	orgId: installation.org_id,
	provider: installation.provider,
	providerUserId,
	turn: {
		approval: driftTurn.approval,
		sessionId: driftTurn.sessionId,
	} as never,
	workspaceId: installation.workspace_id,
});
if (!driftCreated) throw new Error("no drift approval");
// Simulate world-state change deterministically: the stored preview no longer
// matches what a fresh preview computes.
const [primaryStep] = await db
	.select()
	.from(chatApprovalWrites)
	.where(eq(chatApprovalWrites.approval_id, driftCreated.approvalId))
	.orderBy(chatApprovalWrites.position);
if (!primaryStep) throw new Error("drift write missing");
// The stored inner preview may be an MCP envelope; replace it wholesale with
// a parsed-shape record whose money facts cannot match a fresh preview.
const tampered = {
	preview: { currency: "usd", line_items: [], total: 999_999 },
};
const { chatApprovalWritesRepo } = await import(
	"../../src/internal/approvals/repos/chatApprovalWritesRepo.js"
);
await chatApprovalWritesRepo.setPreview({
	approvalId: driftCreated.approvalId,
	db,
	preview: tampered,
	writeId: primaryStep.id,
});
const driftApproval = await chatApprovalRepo.claim({
	approvalId: driftCreated.approvalId,
	db,
	providerUserId,
});
if (!driftApproval) throw new Error("drift claim failed");
const driftResult = await resolveApproval({
	approval: driftApproval,
	providerUserId,
});
check(
	"drifted approve refuses to execute",
	"drifted" in driftResult,
	JSON.stringify(driftResult).slice(0, 160),
);
const [driftRow] = await db
	.select()
	.from(chatApprovals)
	.where(eq(chatApprovals.id, driftCreated.approvalId));
check("drifted row released back to pending", driftRow?.status === "pending");
check("drifted write did not execute", !(await customerHasLaunch(customerC)));

process.exit(results.every((entry) => entry.ok) ? 0 : 1);
