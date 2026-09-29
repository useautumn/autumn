import {
	type Attachment,
	Chat,
	type Message,
	type StateAdapter,
	type Thread,
} from "chat";
import type {
	AgentContextMessage,
	AgentMissedMessages,
} from "../../internal/agentRuntime/domain/agentTurnContext.js";
import { logger } from "../../lib/logger.js";
import { getSlackWorkspaceId } from "./context.js";

const RECENT_MESSAGES_LIMIT = 8;
// `thread.refresh()` fetches the latest 50 messages, so nothing older can be
// replayed; the character budget keeps a long thread from swamping the prompt.
const MISSED_MESSAGES_LIMIT = 50;
const MISSED_MESSAGES_CHAR_BUDGET = 20_000;
// One pasted log must not crowd every other missed reply out of the budget.
const MISSED_MESSAGE_CHAR_LIMIT = 4000;
const TRUNCATED_SUFFIX = " …[truncated]";
// Matches the chat SDK's thread-state lifetime.
const SKIPPED_REPLIES_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Room for every skip in the window plus its delivery.
const REPLY_EVENTS_LIMIT = MISSED_MESSAGES_LIMIT * 2;

/** One append-only log per thread, so skips and deliveries share a single
 * TTL and trimming (newest kept) never drops a delivery whose skip survives. */
type ReplyEvent = Readonly<{ id: string; kind: "delivered" | "skipped" }>;

// A Slack Connect channel keeps its id and timestamps in every workspace it
// is shared with, so the workspace is part of the key.
const replyEventsKey = ({
	message,
	thread,
}: {
	message: Message;
	thread: Thread;
}) => `leaf:reply-events:${getSlackWorkspaceId(message.raw)}:${thread.id}`;

const appendReplyEvent = (
	store: StateAdapter,
	key: string,
	event: ReplyEvent,
) =>
	store.appendToList(key, event, {
		maxLength: REPLY_EVENTS_LIMIT,
		ttlMs: SKIPPED_REPLIES_TTL_MS,
	});

const chatState = () => Chat.getSingleton().getState();

const isPlanBlock = (block: unknown) =>
	typeof block === "object" &&
	block !== null &&
	"type" in block &&
	block.type === "plan";

const isPlanMessage = ({ raw }: Message) =>
	typeof raw === "object" &&
	raw !== null &&
	"blocks" in raw &&
	Array.isArray(raw.blocks) &&
	raw.blocks.some(isPlanBlock);

const isContextMessage = (message: Message) =>
	Boolean(message.text.trim()) && !isPlanMessage(message);

const authorName = (message: Message) =>
	message.author.fullName || message.author.userName || message.author.userId;

const toContextMessage = (message: Message): AgentContextMessage => ({
	author: authorName(message),
	isBot: message.author.isBot,
	text: message.text,
});

/** A file shared earlier in the thread, with the raw Slack message it came
 * from so it can still be downloaded when the SDK dropped its fetcher. */
export type ThreadAttachment = Readonly<{
	attachment: Attachment;
	author: string;
	/** Position in the raw message's `files`, for hydrating Slack Connect stubs. */
	fileIndex: number;
	raw: unknown;
}>;

/** Files in these messages, newest first; the agent's own uploads are left
 * out because it already knows what it posted. */
const threadAttachmentsOf = (
	messages: ReadonlyArray<Message>,
): ThreadAttachment[] =>
	[...messages]
		.reverse()
		.filter((message) => !message.author.isMe)
		.flatMap((message) =>
			(message.attachments ?? []).map((attachment, fileIndex) => ({
				attachment,
				author: authorName(message),
				fileIndex,
				raw: message.raw,
			})),
		);

const truncateText = (text: string) =>
	text.length > MISSED_MESSAGE_CHAR_LIMIT
		? `${text.slice(0, MISSED_MESSAGE_CHAR_LIMIT)}${TRUNCATED_SUFFIX}`
		: text;

/** The newest messages that fit the limit and character budget, oldest first;
 * each message is capped first, so the newest always makes it in. */
const fitMissedMessages = (
	messages: ReadonlyArray<Message>,
): AgentMissedMessages => {
	const kept: AgentContextMessage[] = [];
	let characters = 0;
	for (const message of [...messages].reverse()) {
		const contextMessage = {
			...toContextMessage(message),
			text: truncateText(message.text),
		};
		characters += contextMessage.text.length;
		if (
			kept.length >= MISSED_MESSAGES_LIMIT ||
			characters > MISSED_MESSAGES_CHAR_BUDGET
		) {
			break;
		}
		kept.push(contextMessage);
	}
	return {
		messages: kept.reverse(),
		omittedCount: messages.length - kept.length,
	};
};

export const getRecentMessages = async (
	thread: Thread,
	currentMessage: Message,
): Promise<AgentContextMessage[]> => {
	try {
		await thread.refresh();
	} catch (error) {
		logger.warn("Could not refresh thread context", {
			data: { error },
			event: "leaf.slack_thread_context_refresh_failed",
		});
	}

	const seen = new Set<string>();
	return [...thread.recentMessages, currentMessage]
		.filter((message) => {
			if (seen.has(message.id) || !isContextMessage(message)) return false;
			seen.add(message.id);
			return true;
		})
		.slice(-RECENT_MESSAGES_LIMIT)
		.map(toContextMessage);
};

/** Remembers a reply the agent was not tagged in, so the next turn that does
 * tag it can catch up on what it skipped. The append is atomic, so replies
 * arriving together are all kept. */
export const recordSkippedMessage = async (
	thread: Thread,
	message: Message,
	state?: StateAdapter,
) => {
	try {
		await appendReplyEvent(
			state ?? chatState(),
			replyEventsKey({ message, thread }),
			{ id: message.id, kind: "skipped" },
		);
	} catch (error) {
		logger.warn("Could not record skipped Slack message", {
			data: { error },
			event: "leaf.slack_skipped_message_record_failed",
		});
	}
};

export type LoadedMissedMessages = Readonly<{
	missed?: AgentMissedMessages;
	/** Files in the skipped replies, so a tag after them can use the files. */
	attachments: ThreadAttachment[];
	/** Marks these replies as seen; call once a turn has actually run with
	 * them, so a blocked or failed turn leaves them for the next mention. */
	markDelivered: () => Promise<void>;
}>;

/** The skipped replies not yet handed to a turn, oldest first. Call after
 * `getRecentMessages` has refreshed the thread. */
export const loadMissedMessages = async (
	thread: Thread,
	currentMessage: Message,
	state?: StateAdapter,
): Promise<LoadedMissedMessages | undefined> => {
	try {
		const store = state ?? chatState();
		const key = replyEventsKey({ message: currentMessage, thread });
		const events = await store.getList<ReplyEvent>(key);
		const delivered = new Set(
			events.filter(({ kind }) => kind === "delivered").map(({ id }) => id),
		);
		const pendingIds = events
			.filter(({ id, kind }) => kind === "skipped" && !delivered.has(id))
			.map(({ id }) => id)
			.slice(-MISSED_MESSAGES_LIMIT);
		if (!pendingIds.length) return undefined;

		const pending = new Set(pendingIds);
		const pendingMessages = thread.recentMessages.filter(
			(message) => pending.has(message.id) && message.id !== currentMessage.id,
		);
		const available = pendingMessages.filter(isContextMessage);
		// Skipped ids that fell out of the fetched window can't be replayed.
		const windowIds = new Set(thread.recentMessages.map(({ id }) => id));
		const outOfWindow = pendingIds.filter((id) => !windowIds.has(id)).length;
		const missed = fitMissedMessages(available);

		return {
			attachments: threadAttachmentsOf(pendingMessages),
			markDelivered: async () => {
				for (const id of pendingIds) {
					await appendReplyEvent(store, key, { id, kind: "delivered" });
				}
			},
			missed:
				missed.messages.length || outOfWindow
					? { ...missed, omittedCount: missed.omittedCount + outOfWindow }
					: undefined,
		};
	} catch (error) {
		logger.warn("Could not load skipped Slack messages", {
			data: { error },
			event: "leaf.slack_missed_messages_failed",
		});
		return undefined;
	}
};

/** On the first mention in a thread, the discussion before the recent
 * window the agent already gets, so "do the above" can reach further back.
 * Call after `getRecentMessages` has refreshed the thread. */
export const getEarlierThreadMessages = (
	thread: Thread,
	currentMessage: Message,
): AgentMissedMessages | undefined => {
	const history = thread.recentMessages.filter(
		(message) => message.id !== currentMessage.id && isContextMessage(message),
	);
	// The recent window holds the current message plus the 7 before it.
	const earlier = history.slice(0, -(RECENT_MESSAGES_LIMIT - 1));
	if (!earlier.length) return undefined;
	return fitMissedMessages(earlier);
};

/** On the first mention in a thread, the files shared anywhere earlier in it
 * (within the fetched window), so "use the contract above" can see it.
 * Call after `getRecentMessages` has refreshed the thread. */
export const getEarlierThreadAttachments = (
	thread: Thread,
	currentMessage: Message,
): ThreadAttachment[] =>
	threadAttachmentsOf(
		thread.recentMessages.filter((message) => message.id !== currentMessage.id),
	);

const DELIVERED_FILES_LIMIT = 200;

const deliveredFilesKey = ({
	message,
	thread,
}: {
	message: Message;
	thread: Thread;
}) => `leaf:delivered-files:${getSlackWorkspaceId(message.raw)}:${thread.id}`;

/** The Slack file id behind a thread attachment, when Slack sent one. */
export const threadAttachmentFileId = ({
	fileIndex,
	raw,
}: Pick<ThreadAttachment, "fileIndex" | "raw">): string | undefined => {
	if (typeof raw !== "object" || raw === null || !("files" in raw)) {
		return undefined;
	}
	const { files } = raw;
	if (!Array.isArray(files)) return undefined;
	const file: unknown = files[fileIndex];
	return typeof file === "object" &&
		file !== null &&
		"id" in file &&
		typeof file.id === "string"
		? file.id
		: undefined;
};

/** Earlier files a turn in this thread has not read yet, newest first, so a
 * tag reaches a file an earlier turn could not read without resending, or
 * being crowded out by, the ones it did. */
export const getUndeliveredThreadAttachments = async (
	thread: Thread,
	currentMessage: Message,
	state?: StateAdapter,
): Promise<ThreadAttachment[]> => {
	const earlier = getEarlierThreadAttachments(thread, currentMessage);
	try {
		const delivered = new Set(
			await (state ?? chatState()).getList<string>(
				deliveredFilesKey({ message: currentMessage, thread }),
			),
		);
		return earlier.filter((earlierAttachment) => {
			const fileId = threadAttachmentFileId(earlierAttachment);
			return !(fileId && delivered.has(fileId));
		});
	} catch (error) {
		logger.warn("Could not load delivered Slack files", {
			data: { error },
			event: "leaf.slack_delivered_files_failed",
		});
		return earlier;
	}
};

/** Remembers files a turn has read, so later tags in the thread skip them. */
export const recordDeliveredFiles = async (
	thread: Thread,
	message: Message,
	fileIds: ReadonlyArray<string>,
	state?: StateAdapter,
) => {
	const store = state ?? chatState();
	const key = deliveredFilesKey({ message, thread });
	for (const fileId of fileIds) {
		await store.appendToList(key, fileId, {
			maxLength: DELIVERED_FILES_LIMIT,
			ttlMs: SKIPPED_REPLIES_TTL_MS,
		});
	}
};
