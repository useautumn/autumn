import { withTimeout } from "@autumn/shared";
import { runAgentTurn } from "../../../internal/agentRuntime/actions/runAgentTurn/runAgentTurn.js";
import type { AgentTurnResult } from "../../../internal/agentRuntime/domain/agentTurn.js";
import { TURN_BACKSTOP_MS } from "../../../internal/agentRuntime/turnBudget.js";
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
	const isFollowUp =
		params.recentMessages?.some((message) => message.isBot) ?? false;
	// The thread facts a presenter needs live in setup, not in the turn result.
	const presentable = (result: AgentTurnResult): SlackAgentTurnResult => ({
		...result,
		env: setup.context.env,
		installation: setup.installation,
		org: setup.org,
	});

	const result = await runAgentTurn({
		ctx: {
			...setup.context,
			onTurnResult: params.onSettledTurn
				? async (settled) => {
						await params.onSettledTurn?.(presentable(settled));
					}
				: undefined,
		},
		params: setup.params,
		titleSourceText:
			!isFollowUp && !params.clientContext ? params.text : undefined,
	});
	return presentable(result);
};

export const runSlackAgentTurn = (
	params: SlackAgentTurnParams,
): Promise<SlackAgentTurnResult> =>
	withTimeout({
		fn: () => executeSlackAgentTurn(params),
		timeoutMessage: "Chat agent timed out",
		timeoutMs: TURN_BACKSTOP_MS,
	});
