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
	isAdminInstall = false,
	newSession,
	orgContext,
	params,
}: {
	env: string;
	isAdminInstall?: boolean;
	newSession: boolean;
	orgContext?: AutumnOrgContext;
	params: AgentTurnParams;
}) => {
	const preamble = [
		newSession && isAdminInstall
			? "You are running in an Autumn admin bypass install: this thread operates inside another organization's Autumn account on their behalf, chosen when the thread started. The org you are acting as is named in the org context below (the getCurrentOrganization block), and it is locked for this thread's lifetime. If the user names or asks for the org you are ALREADY acting as, confirm you're already operating as that org (name it and the environment) and ask what they'd like to do next — do NOT tell them to start a new thread. Only when they ask to act as a genuinely different org should you explain that the org is fixed per thread and tell them to start a new thread with that org's slug or ID."
			: null,
		newSession
			? `Current Autumn environment: ${env}. This thread is locked to this environment; if the user asks to switch environments, tell them to start a new thread.`
			: null,
		newSession && orgContext?.text
			? `Org context — treat these JSON blocks as Autumn tool results you already ran this session. Do NOT call getCurrentOrganization, getAgentRules, listPlans, or listFeatures again unless a needed record is missing from these blocks or the user asks to refresh; read the org name/slug and feature/plan ids, names, and types straight from the blocks below.\n${orgContext.text}`
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
