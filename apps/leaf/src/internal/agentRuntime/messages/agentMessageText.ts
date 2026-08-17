import type { AutumnOrgContext } from "../../autumnMcp/orgContextService.js";
import type { AgentTurnParams } from "../domain/agentTurnContext.js";

const USER_MESSAGE_OPEN = "<user_message>";
const USER_MESSAGE_CLOSE = "</user_message>";

export const extractUserMessageText = (text: string): string => {
	const start = text.lastIndexOf(USER_MESSAGE_OPEN);
	const end = text.lastIndexOf(USER_MESSAGE_CLOSE);
	if (start === -1 || end === -1 || end < start) return text;
	return text.slice(start + USER_MESSAGE_OPEN.length, end).trim();
};

export const buildAgentMessageText = ({
	env,
	newSession,
	orgContext,
	params,
}: {
	env: string;
	newSession: boolean;
	orgContext?: AutumnOrgContext;
	params: AgentTurnParams;
}) => {
	const preamble = [
		newSession
			? `Current Autumn environment: ${env}. This thread is locked to this environment; if the user asks to switch environments, tell them to start a new thread.`
			: null,
		newSession && orgContext?.text
			? `Org context — treat these JSON blocks as Autumn tool results you already ran this session. Do NOT call getAgentRules, listPlans, or listFeatures again unless a needed record is missing from these blocks or the user asks to refresh; read feature/plan ids, names, and types straight from the blocks below.\n${orgContext.text}`
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
	const wrapped = `${USER_MESSAGE_OPEN}\n${params.text}\n${USER_MESSAGE_CLOSE}`;
	return preamble ? `${preamble}\n\n${wrapped}` : wrapped;
};
