import type { MessageParams } from "../../agent/runMessage/types.js";
import type { AutumnOrgContext } from "../../internal/autumnMcp/orgContextService.js";

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
	return preamble ? `${preamble}\n\n${params.text}` : params.text;
};
