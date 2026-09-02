import { AppEnv, type ChatApproval } from "@autumn/shared";
import { createApproval } from "../../src/internal/approvals/actions/createApproval.js";
import { chatApprovalRepo } from "../../src/internal/approvals/repos/chatApprovalRepo.js";
import { handleEditApprovalDetailsSubmit } from "../../src/internal/approvals/surfaces/slack/editDetails.js";
import { getInstallationOAuthAccessToken } from "../../src/internal/installations/actions/getInstallationOAuthAccessToken.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import type { SlackChatInstallation } from "../../src/providers/slack/domain/slackAgentTurn.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const CUSTOMER = process.env.E2E_CUSTOMER ?? "leaf-0003";
const PLAN = process.env.E2E_PLAN ?? "launch";
const GROUP_SIZE = Number(process.env.E2E_GROUP ?? "0");

const installation = (await findInstallationWithOrg(
	"slack",
	WORKSPACE_ID,
)) as SlackChatInstallation | null;
if (!installation) throw new Error("no installation");
const providerUserId = installation.installed_by_provider_user_id ?? "";
const threadId = `editdetails-${Date.now().toString(36)}`;

const groupCustomers: string[] = [];
if (GROUP_SIZE > 1) {
	const { executeAutumnMcpTool } = await import(
		"../../src/internal/autumnMcp/client.js"
	);
	const token = await getInstallationOAuthAccessToken({
		env: AppEnv.Sandbox,
		installation,
		orgId: installation.org_id,
	});
	for (let index = 1; index <= GROUP_SIZE; index += 1) {
		const id = `${threadId}-c${index}`;
		await executeAutumnMcpTool({
			args: {
				request: {
					create_in_stripe: true,
					customer_id: id,
					email: `${id}@example.com`,
					name: id,
					with_autumn_id: false,
				},
			},
			env: AppEnv.Sandbox,
			token,
			toolName: "getOrCreateCustomer",
		});
		groupCustomers.push(id);
	}
}

const target = {
	posted: [] as unknown[],
	post: async (content: unknown) => {
		const postable = content as {
			getPostData?: () => { stream: AsyncIterable<unknown> };
			kind?: string;
		};
		if (postable?.kind === "stream" && postable.getPostData) {
			for await (const _ of postable.getPostData().stream) {
			}
		}
		target.posted.push(content);
		return { id: `msg-${target.posted.length}` };
	},
	startTyping: async () => {},
};
const ticker = createStatusTicker(target as never);
const presenter = createEveSlackPresenter({ setStatus: ticker.activity });
const output = await runSlackAgentTurn({
	channelId: threadId,
	installation,
	logger,
	onAction: (m) => presenter.onAction(m),
	onReasoning: presenter.onReasoning,
	onThinking: ticker.thinking,
	providerUserId,
	text:
		GROUP_SIZE > 1
			? `attach the ${PLAN} plan to ${groupCustomers.join(", ")}`
			: `attach the ${PLAN} plan to ${CUSTOMER}`,
	threadId,
});
ticker.stop();
const approvalRequest = (
	output as {
		approval?: { toolArgs: Record<string, unknown>; toolName: string };
	}
).approval;
if (!approvalRequest) {
	console.log("NO APPROVAL:", JSON.stringify(output).slice(0, 300));
	process.exit(1);
}
const created = await createApproval({
	channelId: threadId,
	env: AppEnv.Sandbox,
	getToken: () =>
		getInstallationOAuthAccessToken({
			env: AppEnv.Sandbox,
			installation,
			orgId: installation.org_id,
		}),
	logger,
	orgId: installation.org_id,
	provider: installation.provider,
	providerUserId,
	turn: output as never,
	workspaceId: installation.workspace_id,
});
if (!created) throw new Error("createApproval returned nothing");
await created.backfillGroupedPreviews?.();
const before = (created.toolArgs.request ?? {}) as Record<string, unknown>;
console.log(
	"BEFORE enable_plan_immediately=",
	before.enable_plan_immediately,
	"invoice_mode=",
	JSON.stringify(before.invoice_mode),
	"redirect_mode=",
	before.redirect_mode,
);

const submit = await handleEditApprovalDetailsSubmit({
	values: {
		access: process.env.E2E_ACCESS ?? "after_payment",
		billing: process.env.E2E_BILLING ?? "draft_invoice",
		proration: process.env.E2E_PRORATION ?? "immediate",
	},
	privateMetadata: created.approvalId,
	relatedThread: {
		id: threadId,
		channelId: threadId,
		post: target.post,
		startTyping: target.startTyping,
	} as never,
	user: { userId: providerUserId },
} as never);
console.log("SUBMIT", JSON.stringify(submit));

const deadline = Date.now() + 150_000;
let rebuilt: ChatApproval | undefined;
while (Date.now() < deadline) {
	await new Promise((r) => setTimeout(r, 5000));
	const pending = (await chatApprovalRepo.listPendingForRun({
		channelId: threadId,
		db,
		env: AppEnv.Sandbox,
		orgId: installation.org_id,
		provider: installation.provider,
		runId: (output as { sessionId?: string }).sessionId ?? "",
		workspaceId: installation.workspace_id,
	})) as ChatApproval[];
	rebuilt = pending.find((a) => a.id !== created.approvalId);
	if (rebuilt) break;
}
if (!rebuilt) {
	console.log("NO REBUILT APPROVAL within 150s");
	for (const posted of target.posted.slice(-3)) {
		console.log("POSTED:", JSON.stringify(posted).slice(0, 500));
	}
	process.exit(1);
}
const after = ((rebuilt.tool_args as Record<string, unknown>).request ??
	{}) as Record<string, unknown>;
console.log(
	"AFTER  enable_plan_immediately=",
	after.enable_plan_immediately,
	"invoice_mode=",
	JSON.stringify(after.invoice_mode),
	"redirect_mode=",
	after.redirect_mode,
	"proration_behavior=",
	after.proration_behavior,
);
const wantImmediate =
	(process.env.E2E_ACCESS ?? "after_payment") === "immediate";
const wantBilling = process.env.E2E_BILLING ?? "draft_invoice";
const invoice = (after.invoice_mode ?? {}) as {
	enable_plan_immediately?: boolean;
	enabled?: boolean;
	finalize?: boolean;
};
const wantProration = process.env.E2E_PRORATION ?? "immediate";
const beforeProration =
	before.proration_behavior === "none" ? "next_cycle" : "immediate";
const prorationWritten =
	before.proration_behavior !== undefined || wantProration !== beforeProration;
const expectedProrationBehavior = prorationWritten
	? wantProration === "immediate"
		? "prorate_immediately"
		: "none"
	: undefined;
const rebuiltWithheld = ((rebuilt.tool_args as Record<string, unknown>)
	._eveWithheldWrites ?? []) as Array<{
	input?: { request?: Record<string, unknown> };
}>;
const groupOk =
	GROUP_SIZE <= 1 ||
	(rebuiltWithheld.length === GROUP_SIZE - 1 &&
		rebuiltWithheld.every(
			(step) =>
				step.input?.request?.proration_behavior === expectedProrationBehavior,
		));
console.log(
	`GROUP rebuilt withheld=${rebuiltWithheld.length} prorations=${JSON.stringify(rebuiltWithheld.map((step) => step.input?.request?.proration_behavior))}`,
);
const ok =
	groupOk &&
	after.proration_behavior === expectedProrationBehavior &&
	after.enable_plan_immediately === wantImmediate &&
	(wantBilling === "checkout"
		? after.invoice_mode === undefined && after.redirect_mode === "always"
		: invoice.enabled === true &&
			invoice.finalize === (wantBilling === "finalized_invoice") &&
			invoice.enable_plan_immediately === wantImmediate);
console.log(
	ok
		? `✅ edit honoured: ${wantBilling}, ${wantImmediate ? "immediate" : "after payment"}, proration=${wantProration}`
		: "❌ edit NOT honoured",
);
process.exit(ok ? 0 : 1);
