import type { HarnessUserMessage } from "../../types.js";
import type { ClaudeCodeContentBlocks } from "../types.js";

export const toContentBlocks = ({
	message,
}: {
	message: HarnessUserMessage;
}): ClaudeCodeContentBlocks => {
	const blocks: ClaudeCodeContentBlocks = [];
	for (const attachment of message.attachments ?? []) {
		const data = attachment.data.toString("base64");
		if (attachment.mimeType === "application/pdf") {
			blocks.push({
				source: { data, media_type: "application/pdf", type: "base64" },
				title: attachment.name,
				type: "document",
			});
		} else if (attachment.mimeType.startsWith("image/")) {
			blocks.push({
				source: {
					data,
					media_type: attachment.mimeType as
						| "image/gif"
						| "image/jpeg"
						| "image/png"
						| "image/webp",
					type: "base64",
				},
				type: "image",
			});
		}
	}
	blocks.push({ text: message.text, type: "text" });
	return blocks;
};
