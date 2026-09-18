import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Message, Thread } from "chat";
import { createSlackMessageHandlers } from "../../../../src/providers/slack/handlers/handleSlackMessage.js";
import type { findSlackInstallationForWorkspace } from "../../../../src/providers/slack/installations.js";

type Installation = NonNullable<
	Awaited<ReturnType<typeof findSlackInstallationForWorkspace>>
>;

let disposition: "close" | "keep" = "close";
const dispatchSlackAgentMessage = mock(async (_input: unknown) => disposition);
const recentMessages = [
	{ author: "Autumn", isBot: true, text: "How can I help?" },
];
const getRecentMessages = mock(async () => recentMessages);
let installation: Installation | undefined;
const findInstallation = mock(
	async (_input: { workspaceId: string }) => installation,
);

const dependencies = {
	dispatch: dispatchSlackAgentMessage,
	findInstallation,
	getRecentMessages,
};
const {
	handleSlackMessage,
	handleSlackThreadStart,
	handleSubscribedSlackMessage,
} = createSlackMessageHandlers(dependencies);

const createInstallation = ({
	requireMention = false,
}: {
	requireMention?: boolean;
} = {}) =>
	({
		bot_user_id: "U_BOT",
		org_id: "org_1",
		provider: "slack",
		require_mention: requireMention,
		workspace_id: "T1",
	}) as Installation;

const createMessage = ({
	isBot = false,
	isMention,
	text = "hello",
}: {
	isBot?: boolean;
	isMention?: boolean;
	text?: string;
} = {}) =>
	({
		author: { isBot, userId: "U1" },
		id: "M1",
		isMention,
		raw: { team_id: "T1", text },
		text,
	}) as Message;

const createThread = () => {
	const addReaction = mock(async () => {});
	const unsubscribe = mock(async () => {});
	return {
		addReaction,
		thread: {
			adapter: {
				addReaction,
				removeReaction: mock(async () => {}),
			},
			channelId: "C1",
			id: "slack:C1:1",
			unsubscribe,
		} as unknown as Thread,
		unsubscribe,
	};
};

beforeEach(() => {
	disposition = "close";
	installation = createInstallation();
	dispatchSlackAgentMessage.mockClear();
	findInstallation.mockClear();
	getRecentMessages.mockClear();
});

describe("handleSubscribedSlackMessage", () => {
	test("dispatches with thread context the run can fetch on demand", async () => {
		disposition = "keep";
		const { thread, unsubscribe } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
		const [input] = dispatchSlackAgentMessage.mock.calls[0] as [
			{ recentMessages: () => Promise<typeof recentMessages> },
		];
		expect(await input.recentMessages()).toEqual(recentMessages);
		expect(getRecentMessages).toHaveBeenCalledTimes(1);
		expect(unsubscribe).not.toHaveBeenCalled();
	});

	test("answers every reply, with no relevance judgement", async () => {
		disposition = "keep";
		const { thread, unsubscribe } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
		expect(unsubscribe).not.toHaveBeenCalled();
	});

	test("unsubscribes when dispatch closes the thread for an opt-out", async () => {
		disposition = "close";
		const { thread, unsubscribe } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	test("ignores bot-authored messages", async () => {
		const { thread } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage({ isBot: true }));

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
		expect(getRecentMessages).not.toHaveBeenCalled();
		expect(findInstallation).not.toHaveBeenCalled();
	});

	test("hands the resolved installation to dispatch", async () => {
		disposition = "keep";
		const { thread } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(findInstallation).toHaveBeenCalledWith({ workspaceId: "T1" });
		expect(dispatchSlackAgentMessage).toHaveBeenCalledWith(
			expect.objectContaining({ installation }),
		);
	});

	test("still answers when the installation cannot be found", async () => {
		installation = undefined;
		const { thread } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
	});
});

describe("handleSubscribedSlackMessage with mention-only replies", () => {
	beforeEach(() => {
		installation = createInstallation({ requireMention: true });
	});

	test("ignores replies that do not mention the bot", async () => {
		const { addReaction, thread, unsubscribe } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
		expect(getRecentMessages).not.toHaveBeenCalled();
		expect(addReaction).not.toHaveBeenCalled();
		expect(unsubscribe).not.toHaveBeenCalled();
	});

	test("answers replies the chat SDK flagged as mentions", async () => {
		disposition = "keep";
		const { thread } = createThread();

		await handleSubscribedSlackMessage(
			thread,
			createMessage({ isMention: true }),
		);

		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
	});

	test("answers replies whose raw text mentions the bot", async () => {
		disposition = "keep";
		const { thread } = createThread();

		await handleSubscribedSlackMessage(
			thread,
			createMessage({ text: "<@U_BOT> can you check this?" }),
		);

		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
	});

	test("does not let a bare stop keyword halt the run", async () => {
		const { thread } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage({ text: "stop" }));

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
	});

	test("falls back to answering when the bot user id is unknown", async () => {
		installation = {
			...createInstallation({ requireMention: true }),
			bot_user_id: null,
		};
		disposition = "keep";
		const { thread } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
	});
});

describe("handleSlackMessage", () => {
	test("shows a run plan when a new Slack thread starts", async () => {
		disposition = "keep";
		const { thread } = createThread();

		await handleSlackThreadStart(thread, createMessage());

		expect(dispatchSlackAgentMessage).toHaveBeenCalledWith(
			expect.objectContaining({ showRunPlan: true }),
		);
	});

	test("unsubscribes when dispatch closes the thread", async () => {
		const { thread, unsubscribe } = createThread();

		await handleSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).toHaveBeenCalledWith(
			expect.objectContaining({ showRunPlan: false }),
		);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	test("stays subscribed while thread work remains", async () => {
		disposition = "keep";
		const { thread, unsubscribe } = createThread();

		await handleSlackMessage(thread, createMessage());

		expect(unsubscribe).not.toHaveBeenCalled();
	});

	test("ignores bot-authored messages", async () => {
		const { thread, unsubscribe } = createThread();

		await handleSlackMessage(thread, createMessage({ isBot: true }));

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
		expect(unsubscribe).not.toHaveBeenCalled();
	});
});
