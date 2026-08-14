import type { Channel, Thread } from "chat";

export type ReplyTarget = Thread | Channel;

const typingStatusMessage = "Working on it...";
const maxTypingStatusLength = 50;
const truncationSuffix = "...";

export const formatTypingStatus = (message: string) => {
	const trimmed = message.trim() || typingStatusMessage;
	if (trimmed.length <= maxTypingStatusLength) return trimmed;

	return `${trimmed
		.slice(0, maxTypingStatusLength - truncationSuffix.length)
		.trimEnd()}${truncationSuffix}`;
};
