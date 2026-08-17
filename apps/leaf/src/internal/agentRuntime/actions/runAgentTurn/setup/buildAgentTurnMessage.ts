import type { AutumnOrgContext } from "../../../../autumnMcp/orgContextService.js";
import { env as leafEnv } from "../../../../../lib/env.js";
import type { AgentTurnParams } from "../../../domain/agentTurnContext.js";
import { buildAgentMessageText } from "../../../messages/agentMessageText.js";
import type { EveMessageContent } from "../../../eve/client.js";

export const buildAgentTurnMessage = ({
	env,
	newSession,
	orgContext,
	params,
}: {
	env: string;
	newSession: boolean;
	orgContext?: AutumnOrgContext;
	params: AgentTurnParams;
}): EveMessageContent => {
	const attachments = params.attachments ?? [];
	const messageText = buildAgentMessageText({
		env,
		newSession,
		orgContext,
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
