import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import type { SessionTurnOutcome } from "../../common/types.js";

const ONE_AT_A_TIME_DENY_MESSAGE =
	"Autumn confirms one gated write at a time. This call was not run — ask for it again once the pending confirmation is resolved.";

/**
 * Leaf can only surface one approval card per turn, and the session stays
 * blocked until every awaited confirmation is answered — so deny the extras
 * instead of leaving the turn wedged behind a card that will never appear.
 */
export const denyExtraSuspendedCalls = async ({
	client,
	logger,
	outcome,
	sessionId,
}: {
	client: Anthropic;
	logger: AutumnLogger;
	outcome: SessionTurnOutcome;
	sessionId: string;
}) => {
	const [firstCall, ...extraCalls] = outcome.suspendedQueue ?? [];
	if (!firstCall || extraCalls.length === 0) return;

	try {
		await client.beta.sessions.events.send(sessionId, {
			events: extraCalls.map((call) => ({
				deny_message: ONE_AT_A_TIME_DENY_MESSAGE,
				result: "deny" as const,
				tool_use_id: call.toolCallId,
				type: "user.tool_confirmation" as const,
			})),
		});
	} catch (error) {
		logger.warn("Could not deny the extra suspended tool calls", {
			event: "leaf.session_extra_suspended_deny_failed",
			data: { session_id: sessionId },
			error,
		});
		return;
	}

	outcome.suspendedQueue = [firstCall];
	logger.info("Denied extra suspended tool calls", {
		event: "leaf.session_extra_suspended_denied",
		data: {
			denied_tools: extraCalls.map((call) => call.toolName),
			session_id: sessionId,
		},
	});
};
