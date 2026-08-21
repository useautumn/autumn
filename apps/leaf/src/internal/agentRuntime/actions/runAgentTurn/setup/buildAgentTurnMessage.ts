import { env as leafEnv } from "../../../../../lib/env.js";
import type { AutumnOrgContext } from "../../../../autumnMcp/orgContextService.js";
import type { AgentTurnParams } from "../../../domain/agentTurnContext.js";
import type { EveMessageContent } from "../../../eve/client.js";
import { buildAgentMessageText } from "../../../messages/agentMessageText.js";

export const buildAgentTurnMessage = ({
	env,
	isAdminInstall = false,
	newSession,
	orgContext,
	orgSlug,
	params,
}: {
	env: string;
	isAdminInstall?: boolean;
	newSession: boolean;
	orgContext?: AutumnOrgContext;
	orgSlug?: string;
	params: AgentTurnParams;
}): EveMessageContent => {
	const attachments = params.attachments ?? [];
	const messageText = buildAgentMessageText({
		env,
		isAdminInstall,
		newSession,
		orgContext,
		orgSlug,
		params,
	});
	if (attachments.length === 0) return messageText;

	// Eve corrupts queued file bytes, so attachments stay flag-gated.
	if (leafEnv.EVE_ATTACHMENTS_ENABLED) {
		return [
			{ text: messageText, type: "text" as const },
			...attachments.map((attachment) => ({
				data: `data:${attachment.mimeType};base64,${attachment.data.toString("base64")}`,
				filename: attachment.name,
				mediaType: attachment.mimeType,
				type: "file" as const,
			})),
		];
	}

	const names = attachments
		.map((attachment) => attachment.name ?? attachment.mimeType)
		.join(", ");
	return `${messageText}\n\n(The user attached file(s) — ${names} — but file ingestion isn't available on this channel yet. Acknowledge this and ask them to paste the relevant content as text.)`;
};
