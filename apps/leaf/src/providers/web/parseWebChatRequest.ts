import type { UIMessage } from "ai";
import { z } from "zod";
import type { AgentTurnAttachment } from "../../internal/agentRuntime/domain/agentTurnContext.js";

const DATA_URL_REGEX = /^data:([^;]+);base64,(.*)$/s;
const webChatMetadataSchema = z.object({
	catalogDecision: z.record(z.string(), z.unknown()).optional(),
	questionResponse: z
		.object({ optionId: z.string(), requestId: z.string() })
		.optional(),
});

const dataUrlToAttachment = (
	url: string,
	name?: string,
): AgentTurnAttachment | null => {
	const match = DATA_URL_REGEX.exec(url);
	return match
		? { data: Buffer.from(match[2], "base64"), mimeType: match[1], name }
		: null;
};

export const parseWebChatRequest = ({
	id,
	messages: messagesInput,
}: {
	id?: string;
	messages?: UIMessage[] | null;
}) => {
	const messages = messagesInput ?? [];
	const userMessages = messages.filter((message) => message.role === "user");
	const lastUser = userMessages.at(-1);
	const parts = lastUser?.parts ?? [];
	const text = parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
	const attachments = parts.flatMap((part) =>
		part.type === "file" && part.url
			? ([dataUrlToAttachment(part.url, part.filename)].filter(
					Boolean,
				) as AgentTurnAttachment[])
			: [],
	);
	const parsedMetadata = webChatMetadataSchema.safeParse(lastUser?.metadata);
	const metadata = parsedMetadata.success ? parsedMetadata.data : undefined;
	return {
		attachments,
		clientContext: metadata?.catalogDecision
			? { catalogDecision: metadata.catalogDecision }
			: undefined,
		conversationId: id,
		isFirstUserMessage: userMessages.length <= 1,
		questionResponse: metadata?.questionResponse,
		text,
	};
};
