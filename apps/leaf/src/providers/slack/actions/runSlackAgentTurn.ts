import { ms, withTimeout } from "@autumn/shared";
import { runAgentTurn } from "../../../internal/agentRuntime/actions/runAgentTurn/runAgentTurn.js";
import { MESSAGE_TIMEOUT_MS } from "../../../lib/chatAgentConfig.js";
import type {
	SlackAgentTurnParams,
	SlackAgentTurnResult,
} from "../domain/slackAgentTurn.js";
import { setupSlackAgentTurn } from "../setup/setupSlackAgentTurn.js";

const TIMEOUT_BACKSTOP_GRACE_MS = ms.seconds(20);

const executeSlackAgentTurn = async (
	params: SlackAgentTurnParams,
): Promise<SlackAgentTurnResult> => {
	const setup = await setupSlackAgentTurn(params);
	if (setup.kind === "blocked") return setup;
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
		timeoutMs: MESSAGE_TIMEOUT_MS + TIMEOUT_BACKSTOP_GRACE_MS,
	});
