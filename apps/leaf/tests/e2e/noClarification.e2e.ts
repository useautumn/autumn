/**
 * The screenshot regression: a custom-plan attach must go straight to the
 * approval card — no "confirm before I proceed" question first.
 *
 *   bun tests/e2e/noClarification.e2e.ts
 */
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import type { SlackChatInstallation } from "../../src/providers/slack/domain/slackAgentTurn.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const CUSTOMER_ID = process.env.E2E_CUSTOMER ?? "leaf-0001";
const PLAN_ID = process.env.E2E_PLAN ?? "enterprise";

const makeTarget = () => ({
	post: async (content: unknown) => {
		const postable = content as {
			getPostData?: () => { stream: AsyncIterable<unknown> };
			kind?: string;
		};
		if (postable?.kind === "stream" && postable.getPostData) {
			for await (const _chunk of postable.getPostData().stream) {
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
const threadId = `no-clarify-${Date.now().toString(36)}`;

const target = makeTarget();
const ticker = createStatusTicker(target as never);
const presenter = createEveSlackPresenter({ setStatus: ticker.activity });
const turn = await runSlackAgentTurn({
	channelId: threadId,
	installation,
	logger,
	onAction: (message) => presenter.onAction(message),
	onApprovalsSuperseded: () => {},
	onReasoning: presenter.onReasoning,
	onThinking: ticker.thinking,
	providerUserId,
	text: `Put customer ${CUSTOMER_ID} on a custom ${PLAN_ID} plan for $0/month.`,
	threadId,
});
ticker.stop();

const ok = turn.kind === "approval";
console.log(
	`${ok ? "✅" : "❌"} parked on approval without questions — kind: ${turn.kind}`,
);
if (turn.kind === "question") {
	console.log(`   question: ${JSON.stringify(turn.question).slice(0, 500)}`);
}
if (turn.kind === "reply") console.log(`   reply: ${turn.text.slice(0, 400)}`);
process.exit(ok ? 0 : 1);
