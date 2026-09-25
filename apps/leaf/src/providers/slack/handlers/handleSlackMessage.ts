import type { Message, Thread } from "chat";
import type { AgentMissedMessages } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import { dispatchSlackAgentMessage } from "../actions/dispatchSlackAgentMessage.js";
import { shouldSkipUntaggedReply } from "../routing/replyMode.js";
import {
	getEarlierThreadMessages,
	getRecentMessages,
	recordSkippedMessage,
	takeMissedMessages,
} from "../threadContext.js";

const logUnsubscribeFailure = (error: unknown) => {
	rootLogger.error("Could not close Slack thread subscription", error, {
		event: "leaf.slack_thread_unsubscribe_failed",
	});
};

const shouldSkipMessage = (message: Message) => {
	if (message.author.isBot === true) {
		rootLogger.info("Skipping bot-authored Slack message", {
			event: "leaf.slack_message_skipped",
			data: { reason: "bot_author" },
		});
		return true;
	}
	return false;
};

const unsubscribe = (thread: Thread) =>
	thread.unsubscribe().catch(logUnsubscribeFailure);

type HandlerDependencies = Readonly<{
	dispatch: typeof dispatchSlackAgentMessage;
	getRecentMessages: typeof getRecentMessages;
	shouldSkipReply: typeof shouldSkipUntaggedReply;
}>;

/** Loads the thread once per message: missed-message lookups read the
 * history `getRecentMessages` refreshed, so they wait on the same load. */
const threadHistoryLoader = ({
	getMessages,
	message,
	thread,
}: {
	getMessages: typeof getRecentMessages;
	message: Message;
	thread: Thread;
}) => {
	let recent: ReturnType<typeof getRecentMessages> | undefined;
	const recentMessages = () => {
		recent ??= getMessages(thread, message);
		return recent;
	};
	const afterRefresh =
		(
			load: (
				thread: Thread,
				message: Message,
			) =>
				| AgentMissedMessages
				| undefined
				| Promise<AgentMissedMessages | undefined>,
		) =>
		async () => {
			await recentMessages();
			return await load(thread, message);
		};
	return { afterRefresh, recentMessages };
};

const dispatchMessage = async ({
	message,
	dispatch,
	missedMessages,
	recentMessages,
	showRunPlan,
	thread,
}: {
	message: Message;
	dispatch: typeof dispatchSlackAgentMessage;
	missedMessages?: () => Promise<AgentMissedMessages | undefined>;
	recentMessages:
		| Awaited<ReturnType<typeof getRecentMessages>>
		| (() => ReturnType<typeof getRecentMessages>);
	showRunPlan: boolean;
	thread: Thread;
}) => {
	thread.adapter.addReaction(thread.id, message.id, "eyes").catch(() => {});
	const disposition = await dispatch({
		attachments: message.attachments,
		author: {
			email: message.author.email,
			name:
				message.author.fullName ||
				message.author.userName ||
				message.author.userId,
		},
		channelId: thread.channelId,
		missedMessages,
		providerUserId: message.author.userId,
		raw: message.raw,
		react: async ({ action, emoji }) => {
			if (action === "add") {
				await thread.adapter.addReaction(thread.id, message.id, emoji);
			} else {
				await thread.adapter.removeReaction(thread.id, message.id, emoji);
			}
		},
		recentMessages,
		showRunPlan,
		target: thread,
		text: message.text,
		threadId: thread.id,
	});
	if (disposition !== "close") return;
	await unsubscribe(thread);
};

export const createSlackMessageHandlers = ({
	dispatch = dispatchSlackAgentMessage,
	getRecentMessages: getMessages = getRecentMessages,
	shouldSkipReply = shouldSkipUntaggedReply,
}: Partial<HandlerDependencies> = {}) => {
	const handleSlackMessage = async (thread: Thread, message: Message) => {
		if (shouldSkipMessage(message)) return;
		await dispatchMessage({
			dispatch,
			message,
			recentMessages: () => getMessages(thread, message),
			showRunPlan: false,
			thread,
		});
	};

	const handleSlackThreadStart = async (thread: Thread, message: Message) => {
		if (shouldSkipMessage(message)) return;
		const history = threadHistoryLoader({ getMessages, message, thread });
		await dispatchMessage({
			dispatch,
			message,
			missedMessages: history.afterRefresh(getEarlierThreadMessages),
			recentMessages: history.recentMessages,
			showRunPlan: true,
			thread,
		});
	};

	// Every reply in a subscribed thread is answered unless the workspace is in
	// mentions-only mode, where untagged replies are recorded and replayed to
	// the next turn that tags the agent. "stop" and "stop replying" always get
	// through, handled as control commands inside dispatch.
	const handleSubscribedSlackMessage = async (
		thread: Thread,
		message: Message,
	) => {
		if (shouldSkipMessage(message)) return;
		if (await shouldSkipReply({ message, thread })) {
			rootLogger.info("Skipping untagged Slack reply", {
				event: "leaf.slack_message_skipped",
				data: { reason: "not_mentioned" },
			});
			await recordSkippedMessage(thread, message);
			return;
		}
		const history = threadHistoryLoader({ getMessages, message, thread });
		await dispatchMessage({
			dispatch,
			message,
			missedMessages: history.afterRefresh(takeMissedMessages),
			recentMessages: history.recentMessages,
			showRunPlan: false,
			thread,
		});
	};

	return {
		handleSlackMessage,
		handleSlackThreadStart,
		handleSubscribedSlackMessage,
	} as const;
};

export const {
	handleSlackMessage,
	handleSlackThreadStart,
	handleSubscribedSlackMessage,
} = createSlackMessageHandlers();
