/**
 * Reproduces the multi-write approval case end to end against the local dev
 * stack (eve :3999, server :8080, local postgres). Everything is real except
 * the Slack transport.
 *
 * Run from apps/leaf:
 *   bun tests/e2e/multiWrite.e2e.ts
 */
import { AppEnv, type ChatApproval } from "@autumn/shared";
import { chatApprovalRepo } from "../../src/internal/approvals/repos/chatApprovalRepo.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import type { SlackChatInstallation } from "../../src/providers/slack/domain/slackAgentTurn.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const MESSAGE =
	process.env.E2E_MESSAGE ??
	"update leaf-0001 email to test@oioi.com and then attach the launch plan";

const makeTarget = () => {
	const posted: unknown[] = [];
	return {
		posted,
		post: async (content: unknown) => {
			const postable = content as {
				getPostData?: () => { stream: AsyncIterable<unknown> };
				kind?: string;
			};
			if (postable?.kind === "stream" && postable.getPostData) {
				for await (const _chunk of postable.getPostData().stream) {
					// drain
				}
				posted.push({ kind: "stream" });
				return { id: `msg-${posted.length}` };
			}
			posted.push(content);
			return { id: `msg-${posted.length}` };
		},
		startTyping: async () => {},
	};
};

const installation = (await findInstallationWithOrg(
	"slack",
	WORKSPACE_ID,
)) as SlackChatInstallation | null;
if (!installation) throw new Error(`No slack installation for ${WORKSPACE_ID}`);

const providerUserId = installation.installed_by_provider_user_id ?? "";
const threadId = `multiwrite-${Date.now().toString(36)}`;
console.log(`org=${installation.org_id} thread=${threadId}`);
console.log(`message: ${MESSAGE}\n`);

const target = makeTarget();
const ticker = createStatusTicker(target as never);
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
	text: MESSAGE,
	threadId,
});
ticker.stop();

console.log(`\noutput keys: ${Object.keys(output as object).join(", ")}`);
console.log(`outcome: ${JSON.stringify(output).slice(0, 400)}`);
const runId = (output as { sessionId?: string }).sessionId ?? "";
const pending = (await chatApprovalRepo.listPendingForRun({
	channelId: threadId,
	db,
	env: AppEnv.Sandbox,
	orgId: installation.org_id,
	provider: installation.provider,
	runId,
	workspaceId: installation.workspace_id,
})) as ChatApproval[];

// Render the card exactly as Slack would, from the turn's own approval.
const approvalRequest = (
	output as {
		approval?: { toolArgs: Record<string, unknown>; toolName: string };
	}
).approval;
if (approvalRequest) {
	const { approvalCard } = await import("../../src/ui/blocks.js");
	const { cardToBlockKit } = await import("@chat-adapter/slack");
	// Go through createApproval, which is where Slack gets its card args from —
	// building them any other way skips the preview backfill and the strip.
	const { createApproval } = await import(
		"../../src/internal/approvals/actions/createApproval.js"
	);
	const { getInstallationOAuthAccessToken } = await import(
		"../../src/internal/installations/actions/getInstallationOAuthAccessToken.js"
	);
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
	await created?.backfillGroupedPreviews?.();
	if (!created) throw new Error("createApproval returned nothing");
	const card = approvalCard({
		id: created.approvalId,
		env: AppEnv.Sandbox,
		preview: created.preview,
		toolArgs: created.toolArgs,
		toolName: created.toolName,
	});
	const rendered = JSON.stringify(cardToBlockKit(card));
	console.log(`\nCARD renders attach step: ${rendered.includes("Attaching")}`);
	console.log(`CARD mentions launch: ${rendered.includes("launch")}`);
	console.log(`CARD has raw markdown leak: ${rendered.includes("**")}`);
	console.log(`CARD has attach heading: ${rendered.includes("Attach plan")}`);
	const money = rendered.match(/\$[\d,]+\.\d\d/g) ?? [];
	console.log(`CARD money cells: ${money.join(" ")}`);
	// A grouped card must never show $0.00 for a priced plan — that was the
	// symptom of the unparsed step preview.
	const groupedCount = (
		(created.toolArgs._eveWithheldWrites ?? []) as unknown[]
	).length;
	if (groupedCount && money.length && money.every((cell) => cell === "$0.00")) {
		console.log("❌ every money cell is $0.00 — step previews were not parsed");
		process.exit(1);
	}
	const withheld = (created.toolArgs._eveWithheldWrites ?? []) as unknown[];
	console.log(`GROUPED writes in approval: ${withheld.length}`);
}

const allForChannel = (await chatApprovalRepo.listForChannel({
	channelId: threadId,
	db,
	env: AppEnv.Sandbox,
	orgId: installation.org_id,
	provider: installation.provider,
	workspaceId: installation.workspace_id,
})) as ChatApproval[];
console.log(
	`\n=== APPROVALS (run): ${pending.length} | (channel): ${allForChannel.length} ===`,
);
for (const approval of allForChannel) {
	const args = approval.tool_args as Record<string, unknown>;
	const withheld = (args._eveWithheldWrites ?? []) as Array<{
		toolName: string;
	}>;
	console.log(
		`channel row: tool=${approval.tool_name} status=${approval.status} withheld=[${withheld.map((w) => w.toolName).join(", ")}]`,
	);
}
for (const approval of pending) {
	const args = approval.tool_args as Record<string, unknown>;
	const withheld = (args._eveWithheldWrites ?? []) as Array<{
		toolName: string;
	}>;
	console.log(
		`tool=${approval.tool_name} siblings=${JSON.stringify(args._eveSiblingRequestIds ?? [])} withheld=[${withheld.map((write) => write.toolName).join(", ")}]`,
	);
}
process.exit(0);
