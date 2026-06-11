// Builds CMA `user.message` content blocks from text + attachments. The local
// union structurally matches the SDK's content type (text | image | document),
// so it's assignable to events.send without importing deep SDK type paths.
export type UserMessageContentBlock =
	| { text: string; type: "text" }
	| {
			source: { data: string; media_type: string; type: "base64" };
			type: "image";
	  }
	| {
			source: { data: string; media_type: string; type: "base64" };
			title?: string;
			type: "document";
	  };

export const buildUserMessageContent = ({
	attachments,
	text,
}: {
	attachments?: { data: Buffer; mimeType: string; name?: string }[];
	text: string;
}): UserMessageContentBlock[] => {
	const content: UserMessageContentBlock[] = [{ text, type: "text" }];
	for (const attachment of attachments ?? []) {
		const source = {
			data: attachment.data.toString("base64"),
			media_type: attachment.mimeType,
			type: "base64" as const,
		};
		content.push(
			attachment.mimeType.startsWith("image/")
				? { source, type: "image" }
				: { source, title: attachment.name, type: "document" },
		);
	}
	return content;
};
