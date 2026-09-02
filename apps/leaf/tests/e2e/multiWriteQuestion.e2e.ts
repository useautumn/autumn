/**
 * The grouped-write regression: a question mid-flow rebuilds the approval card,
 * and the other writes in the group must survive that rebuild.
 *
 * Verifies against real customer state, not the card text.
 *
 *   bun tests/e2e/multiWriteQuestion.e2e.ts
 */
import { AppEnv, type ChatApproval } from "@autumn/shared";
import { answerAgentQuestion } from "../../src/internal/agentRuntime/actions/answerAgentQuestion/answerAgentQuestion.js";
import { resolveApproval } from "../../src/internal/approvals/actions/resolveApproval.js";
import { chatApprovalRepo } from "../../src/internal/approvals/repos/chatApprovalRepo.js";
import { executeAutumnMcpTool } from "../../src/internal/autumnMcp/client.js";
import { getInstallationOAuthAccessToken } from "../../src/internal/installations/actions/getInstallationOAuthAccessToken.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import type { SlackChatInstallation } from "../../src/providers/slack/domain/slackAgentTurn.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const CUSTOMER_ID = process.env.E2E_CUSTOMER ?? "leaf-0002";
const PLAN_ID = process.env.E2E_PLAN ?? "launch";
const NEW_EMAIL = `grouped+${Date.now().toString(36)}@example.com`;

const results: Array<{ detail?: string; name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail?: string) => {
	results.push({ detail, name, ok });
	console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const makeTarget = () => ({
	post: async (content: unknown) => {
		const postable = content as {
			getPostData?: () => { stream: AsyncIterable<unknown> };
			kind?: string;
		};
		if (postable?.kind === "stream" && postable.getPostData) {
			for await (const _chunk of postable.getPostData().stream) {
				// drain
			}
		}
		return { id: "msg-1" };
	},
	startTyping: async () => {},
});

const installation = (await findInstallationWithOrg(
	"slack",
	WORKSPACE_ID,
)) as SlackChatInstallation | null;
if (!installation) throw new Error(`No slack installation for ${WORKSPACE_ID}`);
const providerUserId = installation.installed_by_provider_user_id ?? "";
const threadId = `grouped-q-${Date.now().toString(36)}`;

const readCustomer = async () => {
	const token = await getInstallationOAuthAccessToken({
		env: AppEnv.Sandbox,
		installation,
		orgId: installation.org_id,
	});
	const result = await executeAutumnMcpTool({
		args: { request: { customer_id: CUSTOMER_ID, with_autumn_id: false } },
		env: AppEnv.Sandbox,
		token,
		toolName: "getCustomer",
	});
	return JSON.stringify(result);
};

const before = await readCustomer();
check("customer starts without the new email", !before.includes(NEW_EMAIL));

const runTurn = async (text: string) => {
	const target = makeTarget();
	const ticker = createStatusTicker(target as never);
	const presenter = createEveSlackPresenter({ setStatus: ticker.activity });
	const output = await runSlackAgentTurn({
		channelId: threadId,
		installation,
		logger,
		onAction: (message) => presenter.onAction(message),
		onReasoning: presenter.onReasoning,
		onThinking: ticker.thinking,
		providerUserId,
		text,
		threadId,
	});
	ticker.stop();
	return output;
};

// Force the question path: the model must ask before it can build the writes.
const turn = await runTurn(
	`Before doing anything, use ask_question to ask me which email to use for ${CUSTOMER_ID}, offering exactly "keep current" and "use new". Then update ${CUSTOMER_ID}'s email to ${NEW_EMAIL} and attach the ${PLAN_ID} plan.`,
);
check("turn asked a question", turn.kind === "question", `kind: ${turn.kind}`);

if (turn.kind === "question") {
	const option = turn.question.options[1] ?? turn.question.options[0];
	const answered = await answerAgentQuestion({
		auth: {
			appEnv: AppEnv.Sandbox,
			channelId: threadId,
			orgId: installation.org_id,
			provider: installation.provider,
			providerUserId,
			threadId,
			workspaceId: installation.workspace_id,
		},
		optionId: option.id ?? option.label ?? "",
		orgId: installation.org_id,
		requestId: turn.question.requestId,
		sessionId: turn.sessionId,
	});
	check("answering resumed the session", !("error" in answered));

	console.log(`ANSWERED: ${JSON.stringify(answered).slice(0, 400)}`);
	const approvalId = (answered as { chainedApprovalId?: string })
		.chainedApprovalId;
	check("a card was created after the answer", Boolean(approvalId), approvalId);

	if (approvalId) {
		const approval = (await chatApprovalRepo.get({
			approvalId,
			db,
		})) as ChatApproval;
		const withheld = (approval.tool_args._eveWithheldWrites ?? []) as Array<{
			toolName: string;
		}>;
		// Grouped or sequential is the model's call; what must never happen is a
		// write disappearing. Both outcomes are recorded, only loss fails.
		console.log(
			`   grouping: primary=${approval.tool_name} withheld=[${withheld.map((w) => w.toolName).join(", ")}]`,
		);

		const claimed = await chatApprovalRepo.claim({
			approvalId,
			db,
			providerUserId,
		});
		const run = await resolveApproval({
			approval: claimed ?? approval,
			providerUserId,
		});
		check("approving ran without error", !("error" in run));

		const after = await readCustomer();
		check(
			"the email write actually applied",
			after.includes(NEW_EMAIL),
			after.includes(NEW_EMAIL) ? NEW_EMAIL : "email unchanged",
		);
		check(
			"the plan write actually applied",
			after.includes(PLAN_ID),
			after.includes(PLAN_ID) ? PLAN_ID : "plan missing",
		);
	}
}

console.log(
	`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`,
);
process.exit(results.every((r) => r.ok) ? 0 : 1);
