import type { MessageParams } from "../../agent/runMessage/types.js";
import type { AutumnOrgContext } from "../../internal/autumnMcp/orgContextService.js";

const USER_MESSAGE_OPEN = "<user_message>";
const USER_MESSAGE_CLOSE = "</user_message>";

/** The user's actual text, stripped of the injected env/org-context preamble.
 * Used when replaying history so the preamble stays hidden from the dashboard. */
export const extractUserMessageText = (text: string): string => {
	const start = text.lastIndexOf(USER_MESSAGE_OPEN);
	const end = text.lastIndexOf(USER_MESSAGE_CLOSE);
	if (start === -1 || end === -1 || end < start) return text;
	return text.slice(start + USER_MESSAGE_OPEN.length, end).trim();
};

export const buildHarnessMessageText = ({
	env,
	newSession,
	orgContext,
	params,
}: {
	env: string;
	newSession: boolean;
	orgContext?: AutumnOrgContext;
	params: MessageParams;
}) => {
	const preamble = [
		`Current Autumn environment: ${env}. This Slack thread is locked to this environment; if the user asks to switch environments, tell them to start a new thread.`,
		newSession && orgContext?.text
			? `Org context:\nTreat these JSON blocks as already-run Autumn tool results. Do not call getAgentRules, listPlans, or listFeatures again unless the needed record is absent or the user asks to refresh. Use listFeatures to interpret feature ids, names, and types.\n${orgContext.text}`
			: null,
		newSession && params.recentMessages?.length
			? `Recent thread messages:\n${params.recentMessages
					.map(
						(m) => `${m.author}${m.isBot === true ? " (bot)" : ""}: ${m.text}`,
					)
					.join("\n")}`
			: null,
	]
		.filter((section): section is string => Boolean(section))
		.join("\n\n");
	// Wrap the user's text so history replay can strip the preamble cleanly (and
	// the agent gets an unambiguous boundary between context and the request).
	const wrapped = `${USER_MESSAGE_OPEN}\n${params.text}\n${USER_MESSAGE_CLOSE}`;
	return preamble ? `${preamble}\n\n${wrapped}` : wrapped;
};
