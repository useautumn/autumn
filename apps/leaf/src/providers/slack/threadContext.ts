import type { Message, Thread } from "chat";
import type {
	AgentContextMessage,
	AgentMissedMessages,
} from "../../internal/agentRuntime/domain/agentTurnContext.js";
import { logger } from "../../lib/logger.js";

const RECENT_MESSAGES_LIMIT = 8;
// `thread.refresh()` fetches the latest 50 messages, so nothing older can be
// replayed; the character budget keeps a long thread from swamping the prompt.
const MISSED_MESSAGES_LIMIT = 50;
const MISSED_MESSAGES_CHAR_BUDGET = 20_000;

type LeafThreadState = {
	/** Replies skipped in mentions-only mode, oldest first. */
	leafSkippedMessageIds?: string[];
};

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

const toContextMessage = (message: Message): AgentContextMessage => ({
	author:
		message.author.fullName || message.author.userName || message.author.userId,
	isBot: message.author.isBot,
	text: message.text,
});

/** The newest messages that fit the limit and character budget, oldest first. */
const fitMissedMessages = (
	messages: ReadonlyArray<Message>,
): AgentMissedMessages => {
	const kept: Message[] = [];
	let characters = 0;
	for (const message of [...messages].reverse()) {
		characters += message.text.length;
		if (
			kept.length >= MISSED_MESSAGES_LIMIT ||
			characters > MISSED_MESSAGES_CHAR_BUDGET
		) {
			break;
		}
		kept.push(message);
	}
	return {
		messages: kept.reverse().map(toContextMessage),
		omittedCount: messages.length - kept.length,
	};
};

const readSkippedMessageIds = async (thread: Thread) => {
	const state = (await thread.state) as LeafThreadState | null;
	return state?.leafSkippedMessageIds ?? [];
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
 * tag it can catch up on what it skipped. */
export const recordSkippedMessage = async (
	thread: Thread,
	message: Message,
) => {
	try {
		const skipped = await readSkippedMessageIds(thread);
		await thread.setState({
			leafSkippedMessageIds: [...skipped, message.id].slice(
				-MISSED_MESSAGES_LIMIT,
			),
		} satisfies LeafThreadState);
	} catch (error) {
		logger.warn("Could not record skipped Slack message", {
			data: { error },
			event: "leaf.slack_skipped_message_record_failed",
		});
	}
};

/** The skipped replies still in the refreshed history, oldest first; they
 * are cleared from thread state once handed to a turn. Call after
 * `getRecentMessages` has refreshed the thread. */
export const takeMissedMessages = async (
	thread: Thread,
	currentMessage: Message,
): Promise<AgentMissedMessages | undefined> => {
	try {
		const skippedIds = await readSkippedMessageIds(thread);
		if (!skippedIds.length) return undefined;
		const skipped = new Set(skippedIds);
		const available = thread.recentMessages.filter(
			(message) =>
				skipped.has(message.id) &&
				message.id !== currentMessage.id &&
				isContextMessage(message),
		);
		// Skipped ids that fell out of the fetched window can't be replayed.
		const windowIds = new Set(thread.recentMessages.map(({ id }) => id));
		const outOfWindow = skippedIds.filter((id) => !windowIds.has(id)).length;

		// Re-read so a reply skipped while this turn set up stays recorded.
		const latestIds = await readSkippedMessageIds(thread);
		await thread.setState({
			leafSkippedMessageIds: latestIds.filter((id) => !skipped.has(id)),
		} satisfies LeafThreadState);

		const missed = fitMissedMessages(available);
		if (!missed.messages.length && !outOfWindow) return undefined;
		return { ...missed, omittedCount: missed.omittedCount + outOfWindow };
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
