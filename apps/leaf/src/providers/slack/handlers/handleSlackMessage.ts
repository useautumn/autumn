import type { Message, Thread } from "chat";
import { logger as rootLogger } from "../../../lib/logger.js";
import { dispatchSlackAgentMessage } from "../actions/dispatchSlackAgentMessage.js";
import { getRecentMessages } from "../threadContext.js";

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
}>;

const dispatchMessage = async ({
	message,
	dispatch,
	recentMessages,
	showRunPlan,
	thread,
}: {
	message: Message;
	dispatch: typeof dispatchSlackAgentMessage;
	recentMessages:
		| Awaited<ReturnType<typeof getRecentMessages>>
		| (() => ReturnType<typeof getRecentMessages>);
	showRunPlan: boolean;
	thread: Thread;
}) => {
	thread.adapter.addReaction(thread.id, message.id, "eyes").catch(() => {});
	const disposition = await dispatch({
		attachments: message.attachments,
		channelId: thread.channelId,
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
		await dispatchMessage({
			dispatch,
			message,
			recentMessages: () => getMessages(thread, message),
			showRunPlan: true,
			thread,
		});
	};

	// Every reply in a subscribed thread is answered; "stop" and "stop replying"
	// are the only way out, handled as control commands inside dispatch.
	const handleSubscribedSlackMessage = async (
		thread: Thread,
		message: Message,
	) => {
		if (shouldSkipMessage(message)) return;
		await dispatchMessage({
			dispatch,
			message,
			recentMessages: () => getMessages(thread, message),
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
