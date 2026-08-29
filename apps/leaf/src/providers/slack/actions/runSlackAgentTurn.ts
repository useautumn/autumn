import { withTimeout } from "@autumn/shared";
import { runAgentTurn } from "../../../internal/agentRuntime/actions/runAgentTurn/runAgentTurn.js";
import { TURN_BACKSTOP_MS } from "../../../internal/agentRuntime/turnBudget.js";
import { matchPendingApprovalReply } from "../../../internal/approvals/actions/matchPendingApprovalReply.js";
import type {
	SlackAgentTurnParams,
	SlackAgentTurnResult,
} from "../domain/slackAgentTurn.js";
import { setupSlackAgentTurn } from "../setup/setupSlackAgentTurn.js";

const executeSlackAgentTurn = async (
	params: SlackAgentTurnParams,
): Promise<SlackAgentTurnResult> => {
	const setup = await setupSlackAgentTurn(params);
	if (setup.kind === "blocked") return setup;
	const session = setup.context.eveSession;
	if (session) {
		const matched = await matchPendingApprovalReply({
			channelId: params.channelId,
			env: setup.context.env,
			orgId: setup.org.id,
			provider: setup.installation.provider,
			runId: session.sessionId,
			text: params.text,
			workspaceId: setup.installation.workspace_id,
		});
		if (matched && "guidance" in matched) {
			return {
				env: setup.context.env,
				kind: "approval_guidance",
				text: matched.guidance,
			};
		}
		if (matched) {
			return { ...matched, env: setup.context.env, kind: "approval_reply" };
		}
	}
	const isFollowUp =
		params.recentMessages?.some((message) => message.isBot) ?? false;

	const result = await runAgentTurn({
		ctx: setup.context,
		params: setup.params,
		titleSourceText:
			!isFollowUp && !params.clientContext ? params.text : undefined,
	});
	return {
		...result,
		env: setup.context.env,
		installation: setup.installation,
		org: setup.org,
	};
};

export const runSlackAgentTurn = (
	params: SlackAgentTurnParams,
): Promise<SlackAgentTurnResult> =>
	withTimeout({
		fn: () => executeSlackAgentTurn(params),
		timeoutMessage: "Chat agent timed out",
		timeoutMs: TURN_BACKSTOP_MS,
	});
