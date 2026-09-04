import type { AutumnOrgContext } from "../../../../autumnMcp/orgContextService.js";
import type {
	AgentTurnParams,
	PendingApprovalNote,
} from "../../../domain/agentTurnContext.js";
import type { EveMessageContent } from "../../../eve/client.js";
import { buildAgentMessageText } from "../../../messages/agentMessageText.js";

export const buildAgentTurnMessage = ({
	env,
	isAdminInstall = false,
	newSession,
	orgContext,
	orgSlug,
	params,
	pendingApprovals,
}: {
	env: string;
	isAdminInstall?: boolean;
	newSession: boolean;
	orgContext?: AutumnOrgContext;
	orgSlug?: string;
	params: AgentTurnParams;
	pendingApprovals?: ReadonlyArray<PendingApprovalNote>;
}): EveMessageContent => {
	const attachments = params.attachments ?? [];
	const messageText = buildAgentMessageText({
		env,
		isAdminInstall,
		newSession,
		orgContext,
		orgSlug,
		params,
		pendingApprovals,
	});
	if (attachments.length === 0) return messageText;

	return [
		{ text: messageText, type: "text" as const },
		...attachments.map((attachment) => ({
			data: `data:${attachment.mimeType};base64,${attachment.data.toString("base64")}`,
			filename: attachment.name,
			mediaType: attachment.mimeType,
			type: "file" as const,
		})),
	];
};
