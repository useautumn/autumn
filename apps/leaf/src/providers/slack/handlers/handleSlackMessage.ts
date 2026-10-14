import type { ChatTrustedBot } from "@autumn/shared";
import { Chat, type Message, type StateAdapter, type Thread } from "chat";
import type { AgentMissedMessages } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import { dispatchSlackAgentMessage } from "../actions/dispatchSlackAgentMessage.js";
import { getSlackWorkspaceId } from "../context.js";
import { slackMentionedUserIds, slackMessageMentionsUser } from "../events.js";
import {
	findSlackInstallationForWorkspace,
	isAgentBotUser,
} from "../installations.js";
import { controlMessageFrom } from "../routing/controlMessage.js";
import { shouldSkipUntaggedReply } from "../routing/replyMode.js";
import {
	getEarlierThreadMessages,
	getRecentMessages,
	getUndeliveredThreadAttachments,
	loadMissedMessages,
	recordDeliveredFiles,
	recordSkippedMessage,
	type ThreadAttachment,
} from "../threadContext.js";
import { findTrustedSlackBot } from "../trustedBots.js";

const logUnsubscribeFailure = (error: unknown) => {
	rootLogger.error("Could not close Slack thread subscription", error, {
		event: "leaf.slack_thread_unsubscribe_failed",
	});
};

const findTrustedBotAuthor = async ({ message }: { message: Message }) => {
	const installation = await findSlackInstallationForWorkspace({
		workspaceId: getSlackWorkspaceId(message.raw),
	});
	return findTrustedSlackBot({ installation, raw: message.raw });
};

type MessageAdmission =
	| { skip: true }
	| { skip: false; trustedBot?: ChatTrustedBot };

const SLACKBOT_USER_ID = "USLACKBOT";

export const isSlackbotNotice = (message: Message) =>
	message.author.userId === SLACKBOT_USER_ID;

const admitMessage = async ({
	findTrustedBot,
	message,
}: {
	findTrustedBot: typeof findTrustedBotAuthor;
	message: Message;
}): Promise<MessageAdmission> => {
	if (isSlackbotNotice(message)) {
		rootLogger.info("Skipping Slackbot notice", {
			event: "leaf.slack_message_skipped",
			data: { reason: "slackbot_notice" },
		});
		return { skip: true };
	}
	if (message.author.isBot !== true) return { skip: false };
	const trustedBot = await findTrustedBot({ message });
	if (trustedBot) {
		rootLogger.info("Admitting trusted bot Slack message", {
			event: "leaf.slack_trusted_bot_message",
			data: { slack_id: trustedBot.slack_id },
		});
		return { skip: false, trustedBot };
	}
	rootLogger.info("Skipping bot-authored Slack message", {
		event: "leaf.slack_message_skipped",
		data: { reason: "bot_author" },
	});
	return { skip: true };
};

const unsubscribe = (thread: Thread) =>
	thread.unsubscribe().catch(logUnsubscribeFailure);

export const messageTagsAnyAgent = async ({
	isAgentBot = isAgentBotUser,
	message,
}: {
	isAgentBot?: typeof isAgentBotUser;
	message: Message;
}) => isAgentBot({ userIds: slackMentionedUserIds({ raw: message.raw }) });

const messageMentionsAgent = async ({ message }: { message: Message }) => {
	const installation = await findSlackInstallationForWorkspace({
		workspaceId: getSlackWorkspaceId(message.raw),
	});
	const botUserId = installation?.bot_user_id;
	if (!botUserId) return false;
	return slackMessageMentionsUser({ raw: message.raw, userId: botUserId });
};

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
	findTrustedBot: typeof findTrustedBotAuthor;
	getRecentMessages: typeof getRecentMessages;
	getState: () => StateAdapter;
	mentionsAgent: typeof messageMentionsAgent;
	tagsAnyAgent: typeof messageTagsAnyAgent;
	shouldSkipReply: typeof shouldSkipUntaggedReply;
}>;

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
		<T>(load: (thread: Thread, message: Message) => T | Promise<T>) =>
		async () => {
			await recentMessages();
			return await load(thread, message);
		};
	return { afterRefresh, recentMessages };
};

const dispatchMessage = async ({
	message,
	dispatch,
	getState,
	text = message.text,
	missedMessages,
	onMissedMessagesDelivered,
	recentMessages,
	showRunPlan,
	thread,
	threadAttachments,
	trustedBot,
}: {
	message: Message;
	dispatch: typeof dispatchSlackAgentMessage;
	getState: () => StateAdapter;
	missedMessages?: () => Promise<AgentMissedMessages | undefined>;
	onMissedMessagesDelivered?: () => Promise<void>;
	recentMessages:
		| Awaited<ReturnType<typeof getRecentMessages>>
		| (() => ReturnType<typeof getRecentMessages>);
	showRunPlan: boolean;
	text?: string;
	thread: Thread;
	threadAttachments?: () => Promise<ReadonlyArray<ThreadAttachment>>;
	trustedBot?: ChatTrustedBot;
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
		onAttachmentsDelivered: (fileIds) =>
			recordDeliveredFiles(thread, message, fileIds, getState()),
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
		threadAttachments,
		threadId: thread.id,
		trustedBot,
	});
	if (disposition !== "close") return;
	await unsubscribe(thread);
};

export const createSlackMessageHandlers = ({
	dispatch = dispatchSlackAgentMessage,
	findTrustedBot = findTrustedBotAuthor,
	getRecentMessages: getMessages = getRecentMessages,
	getState = () => Chat.getSingleton().getState(),
	mentionsAgent = messageMentionsAgent,
	shouldSkipReply = shouldSkipUntaggedReply,
	tagsAnyAgent = messageTagsAnyAgent,
}: Partial<HandlerDependencies> = {}) => {
	const admit = (message: Message) => admitMessage({ findTrustedBot, message });
	const undeliveredAttachments = (thread: Thread, message: Message) =>
		getUndeliveredThreadAttachments(thread, message, getState());

	const handleSlackMessage = async (thread: Thread, message: Message) => {
		const admission = await admit(message);
		if (admission.skip) return;
		await dispatchMessage({
			dispatch,
			getState,
			message,
			recentMessages: () => getMessages(thread, message),
			showRunPlan: false,
			thread,
			trustedBot: admission.trustedBot,
		});
	};

	const handleSlackThreadStart = async (thread: Thread, message: Message) => {
		const admission = await admit(message);
		if (admission.skip) return;
		const history = threadHistoryLoader({ getMessages, message, thread });
		await dispatchMessage({
			dispatch,
			getState,
			message,
			missedMessages: history.afterRefresh(getEarlierThreadMessages),
			threadAttachments: history.afterRefresh(undeliveredAttachments),
			recentMessages: history.recentMessages,
			showRunPlan: true,
			thread,
			trustedBot: admission.trustedBot,
		});
	};

	const replyInSubscribedThread = async ({
		message,
		text,
		thread,
		trustedBot,
	}: {
		message: Message;
		text: string;
		thread: Thread;
		trustedBot?: ChatTrustedBot;
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
		let loadedMissed: ReturnType<typeof loadMissedMessages> | undefined;
		const loadMissed = history.afterRefresh(() => {
			loadedMissed ??= loadMissedMessages(thread, message, getState());
			return loadedMissed;
		});
		const earlierAttachments = history.afterRefresh(undeliveredAttachments);
		await dispatchMessage({
			dispatch,
			getState,
			message,
			missedMessages: async () => (await loadMissed())?.missed,
			onMissedMessagesDelivered: async () => {
				await (await loadedMissed)?.markDelivered();
			},
			recentMessages: history.recentMessages,
			showRunPlan: false,
			text,
			thread,
			threadAttachments: async () =>
				(await tagsAnyAgent({ message }))
					? await earlierAttachments()
					: ((await loadMissed())?.attachments ?? []),
			trustedBot,
		});
	};

	const handleSubscribedSlackMessage = async (
		thread: Thread,
		message: Message,
	) => {
		const admission = await admit(message);
		if (admission.skip) return;
		await replyInSubscribedThread({
			message,
			text: message.text,
			thread,
			trustedBot: admission.trustedBot,
		});
	};

	const handleEditedSlackMessage = async (
		thread: Thread,
		message: Message,
		previousMessage?: Message,
	) => {
		if (thread.adapter.name !== "slack") return;
		const admission = await admit(message);
		if (admission.skip) return;
		const { trustedBot } = admission;
		if (previousMessage && previousMessage.text === message.text) return;
		const text = controlMessageFrom(message.text)
			? message.text
			: editedMessageText({
					previousText: previousMessage?.text,
					text: message.text,
				});
		rootLogger.info("Handling edited Slack message", {
			event: "leaf.slack_message_edited",
		});
		if (await thread.isSubscribed()) {
			await replyInSubscribedThread({ message, text, thread, trustedBot });
			return;
		}
		if (thread.isDM) {
			await dispatchMessage({
				dispatch,
				getState,
				message,
				recentMessages: () => getMessages(thread, message),
				showRunPlan: false,
				text,
				thread,
				trustedBot,
			});
			return;
		}
		if (!(await mentionsAgent({ message }))) return;
		await thread.subscribe();
		const history = threadHistoryLoader({ getMessages, message, thread });
		await dispatchMessage({
			dispatch,
			getState,
			message,
			missedMessages: history.afterRefresh(getEarlierThreadMessages),
			threadAttachments: history.afterRefresh(undeliveredAttachments),
			recentMessages: history.recentMessages,
			showRunPlan: true,
			text,
			thread,
			trustedBot,
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
