import { Chat, type Message, type StateAdapter, type Thread } from "chat";
import type { AgentMissedMessages } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import { dispatchSlackAgentMessage } from "../actions/dispatchSlackAgentMessage.js";
import { getSlackWorkspaceId } from "../context.js";
import { slackMessageMentionsUser } from "../events.js";
import { findSlackInstallationForWorkspace } from "../installations.js";
import { shouldSkipUntaggedReply } from "../routing/replyMode.js";
import {
	getEarlierThreadMessages,
	getRecentMessages,
	loadMissedMessages,
	recordSkippedMessage,
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

/** Whether the raw Slack message @-mentions this workspace's agent. Any
 * doubt (no installation, no bot user id) counts as a mention, matching
 * `slackMessageMentionsUser`. */
const messageMentionsAgent = async ({ message }: { message: Message }) => {
	const installation = await findSlackInstallationForWorkspace({
		workspaceId: getSlackWorkspaceId(message.raw),
	});
	return slackMessageMentionsUser({
		raw: message.raw,
		userId: installation?.bot_user_id,
	});
};

/** An edit reaches the agent as a new turn that says what changed, so it can
 * redo or correct work based on the original wording. */
export const editedMessageText = ({
	previousText,
	text,
}: {
	previousText?: string;
	text: string;
}) =>
	previousText?.trim()
		? `(I edited my earlier message.)\nBefore: ${previousText}\nNow: ${text}`
		: `(I edited my earlier message.) ${text}`;

type HandlerDependencies = Readonly<{
	dispatch: typeof dispatchSlackAgentMessage;
	getRecentMessages: typeof getRecentMessages;
	getState: () => StateAdapter;
	mentionsAgent: typeof messageMentionsAgent;
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
	text = message.text,
	missedMessages,
	onMissedMessagesDelivered,
	recentMessages,
	showRunPlan,
	thread,
}: {
	message: Message;
	dispatch: typeof dispatchSlackAgentMessage;
	missedMessages?: () => Promise<AgentMissedMessages | undefined>;
	onMissedMessagesDelivered?: () => Promise<void>;
	recentMessages:
		| Awaited<ReturnType<typeof getRecentMessages>>
		| (() => ReturnType<typeof getRecentMessages>);
	showRunPlan: boolean;
	text?: string;
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
		onMissedMessagesDelivered,
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
		text,
		threadId: thread.id,
	});
	if (disposition !== "close") return;
	await unsubscribe(thread);
};

export const createSlackMessageHandlers = ({
	dispatch = dispatchSlackAgentMessage,
	getRecentMessages: getMessages = getRecentMessages,
	getState = () => Chat.getSingleton().getState(),
	mentionsAgent = messageMentionsAgent,
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
	const replyInSubscribedThread = async ({
		message,
		text,
		thread,
	}: {
		message: Message;
		text: string;
		thread: Thread;
	}) => {
		if (await shouldSkipReply({ message, thread })) {
			rootLogger.info("Skipping untagged Slack reply", {
				event: "leaf.slack_message_skipped",
				data: { reason: "not_mentioned" },
			});
			await recordSkippedMessage(thread, message, getState());
			return;
		}
		const history = threadHistoryLoader({ getMessages, message, thread });
		let markDelivered: (() => Promise<void>) | undefined;
		await dispatchMessage({
			dispatch,
			message,
			missedMessages: history.afterRefresh(async () => {
				const loaded = await loadMissedMessages(thread, message, getState());
				markDelivered = loaded?.markDelivered;
				return loaded?.missed;
			}),
			onMissedMessagesDelivered: async () => {
				await markDelivered?.();
			},
			recentMessages: history.recentMessages,
			showRunPlan: false,
			text,
			thread,
		});
	};

	const handleSubscribedSlackMessage = async (
		thread: Thread,
		message: Message,
	) => {
		if (shouldSkipMessage(message)) return;
		await replyInSubscribedThread({ message, text: message.text, thread });
	};

	// A Slack edit is routed like a new message carrying the edited text: in
	// a thread the agent already follows it goes through the subscribed-reply
	// rules, in a DM it is answered, and elsewhere it starts a thread only
	// when the edited message @-mentions the agent (e.g. a tag added late).
	const handleEditedSlackMessage = async (
		thread: Thread,
		message: Message,
		previousMessage?: Message,
	) => {
		if (thread.adapter.name !== "slack") return;
		if (shouldSkipMessage(message)) return;
		if (previousMessage && previousMessage.text === message.text) return;
		const text = editedMessageText({
			previousText: previousMessage?.text,
			text: message.text,
		});
		rootLogger.info("Handling edited Slack message", {
			event: "leaf.slack_message_edited",
		});
		if (await thread.isSubscribed()) {
			await replyInSubscribedThread({ message, text, thread });
			return;
		}
		if (thread.isDM) {
			await dispatchMessage({
				dispatch,
				message,
				recentMessages: () => getMessages(thread, message),
				showRunPlan: false,
				text,
				thread,
			});
			return;
		}
		if (!(await mentionsAgent({ message }))) return;
		await thread.subscribe();
		const history = threadHistoryLoader({ getMessages, message, thread });
		await dispatchMessage({
			dispatch,
			message,
			missedMessages: history.afterRefresh(getEarlierThreadMessages),
			recentMessages: history.recentMessages,
			showRunPlan: true,
			text,
			thread,
		});
	};

	return {
		handleEditedSlackMessage,
		handleSlackMessage,
		handleSlackThreadStart,
		handleSubscribedSlackMessage,
	} as const;
};

export const {
	handleEditedSlackMessage,
	handleSlackMessage,
	handleSlackThreadStart,
	handleSubscribedSlackMessage,
} = createSlackMessageHandlers();
