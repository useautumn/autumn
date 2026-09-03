import type { AutumnOrgContext } from "../../autumnMcp/orgContextService.js";
import type {
	AgentTurnParams,
	PendingApprovalNote,
} from "../domain/agentTurnContext.js";

const USER_MESSAGE_OPEN = "<user_message>";
const USER_MESSAGE_CLOSE = "</user_message>";

export const extractUserMessageText = (text: string): string => {
	const start = text.lastIndexOf(USER_MESSAGE_OPEN);
	const end = text.lastIndexOf(USER_MESSAGE_CLOSE);
	if (start === -1 || end === -1 || end < start) return text;
	return text.slice(start + USER_MESSAGE_OPEN.length, end).trim();
};

const PENDING_APPROVAL_GUIDANCE =
	"If this message changes the request, re-preview and re-issue the write with the adjusted body; the old card withdraws automatically.";

/** The cards still awaiting the user's decision, as the exact write bodies
 * the model issued — the same `tool: {json}` lines the Edit-details path
 * sends, so a reply that changes the request has the body to adjust. */
const pendingApprovalsSection = (
	pendingApprovals: ReadonlyArray<PendingApprovalNote>,
) => {
	if (!pendingApprovals.length) return null;
	const cards = pendingApprovals.map((approval, index) => {
		const heading =
			pendingApprovals.length > 1
				? `Pending approval ${index + 1} of ${pendingApprovals.length}`
				: "Pending approval";
		return [
			`${heading} (awaiting the user's decision on the card):`,
			...approval.writes.map(
				(write) => `${write.toolName}: ${JSON.stringify(write.request)}`,
			),
		].join("\n");
	});
	return [...cards, PENDING_APPROVAL_GUIDANCE].join("\n");
};

const adminBypassPreamble = ({
	env,
	orgSlug,
}: {
	env: string;
	orgSlug?: string;
}) => {
	const org = orgSlug ?? "the org selected in this thread";
	return `You are Autumn's internal admin bot, operating inside another organization's Autumn account. This is the first turn of the thread: the user's message sets which org you act as, and you are now acting as ${org} in the ${env} environment for the rest of this thread. When the message selects, names, or confirms ${org}, treat it as their instruction and acknowledge it freshly — e.g. "OK, now acting as ${org} in ${env}. What would you like to do?" Do NOT phrase it as if you were already acting as it before they asked, and do NOT tell them to start a new thread. Only if they ask for a DIFFERENT org should you explain the org is fixed per thread and tell them to start a new thread with that org's slug or ID. Full org details are in the getCurrentOrganization block below.`;
};

export const buildAgentMessageText = ({
	env,
	isAdminInstall = false,
	newSession,
	now = new Date(),
	orgContext,
	orgSlug,
	params,
	pendingApprovals = [],
}: {
	env: string;
	isAdminInstall?: boolean;
	newSession: boolean;
	now?: Date;
	orgContext?: AutumnOrgContext;
	orgSlug?: string;
	params: AgentTurnParams;
	pendingApprovals?: ReadonlyArray<PendingApprovalNote>;
}) => {
	// The Edit-details modal already sends the exact body with its own
	// instruction; a second copy would compete with it.
	const approvalEdit = Boolean(params.clientContext?.approvalEdit);
	const preamble = [
		// The model has no clock; without this it guesses the year for date
		// ranges (log windows, custom_range) and queries the wrong one.
		`Current date and time (UTC): ${now.toISOString()}. Derive every date range, "today", "yesterday", and "last N days" from this, never from memory.`,
		newSession && isAdminInstall ? adminBypassPreamble({ env, orgSlug }) : null,
		newSession
			? `Current Autumn environment: ${env}. This thread is locked to this environment; if the user asks to switch environments, tell them to start a new thread.`
			: null,
		newSession && orgContext?.text
			? `Org context — treat these JSON blocks as the current org state. Read the org name/slug and feature/plan ids, names, prices, and types straight from the blocks below; if a needed record is missing or the user wants details beyond them, look it up with the Autumn tools instead of guessing.\n${orgContext.text}`
			: null,
		newSession && params.recentMessages?.length
			? `Recent thread messages:\n${params.recentMessages
					.map(
						(m) => `${m.author}${m.isBot === true ? " (bot)" : ""}: ${m.text}`,
					)
					.join("\n")}`
			: null,
		!newSession && !approvalEdit
			? pendingApprovalsSection(pendingApprovals)
			: null,
	]
		.filter((section): section is string => Boolean(section))
		.join("\n\n");
	const wrapped = `${USER_MESSAGE_OPEN}\n${params.text}\n${USER_MESSAGE_CLOSE}`;
	return preamble ? `${preamble}\n\n${wrapped}` : wrapped;
};
