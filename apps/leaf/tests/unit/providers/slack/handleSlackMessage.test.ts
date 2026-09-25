import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Message, StateAdapter, Thread } from "chat";
import { createSlackMessageHandlers } from "../../../../src/providers/slack/handlers/handleSlackMessage.js";

let disposition: "close" | "keep" = "close";
const dispatchSlackAgentMessage = mock(async (_input: unknown) => disposition);
const recentMessages = [
	{ author: "Autumn", isBot: true, text: "How can I help?" },
];
const getRecentMessages = mock(async () => recentMessages);
let skipReply = false;
const shouldSkipReply = mock(async (_input: unknown) => skipReply);
let mentionsAgentResult = false;
const mentionsAgent = mock(async (_input: unknown) => mentionsAgentResult);

let lists = new Map<string, unknown[]>();
const state = {
	appendToList: async (key: string, value: unknown) => {
		lists.set(key, [...(lists.get(key) ?? []), value]);
	},
	getList: async (key: string) => lists.get(key) ?? [],
} as unknown as StateAdapter;

const dependencies = {
	dispatch: dispatchSlackAgentMessage,
	getRecentMessages,
	getState: () => state,
	mentionsAgent,
	shouldSkipReply,
};
const {
	handleEditedSlackMessage,
	handleSlackMessage,
	handleSlackThreadStart,
	handleSubscribedSlackMessage,
} = createSlackMessageHandlers(dependencies);

const createMessage = ({
	author,
	id = "M1",
	isBot = false,
	text = "hello",
}: {
	author?: Partial<Message["author"]>;
	id?: string;
	isBot?: boolean;
	text?: string;
} = {}) =>
	({
		author: author ?? { isBot, userId: "U1" },
		id,
		raw: { team_id: "T1" },
		text,
	}) as Message;

const createThread = (
	history: Message[] = [],
	{
		adapterName = "slack",
		isDM = false,
		subscribed = true,
	}: { adapterName?: string; isDM?: boolean; subscribed?: boolean } = {},
) => {
	const addReaction = mock(async () => {});
	const subscribe = mock(async () => {});
	const unsubscribe = mock(async () => {});
	return {
		addReaction,
		subscribe,
		thread: {
			adapter: {
				addReaction,
				name: adapterName,
				removeReaction: mock(async () => {}),
			},
			channelId: "C1",
			id: "slack:C1:1",
			isDM,
			isSubscribed: async () => subscribed,
			recentMessages: history,
			subscribe,
			unsubscribe,
		} as unknown as Thread,
		unsubscribe,
	};
};

type DispatchInput = {
	missedMessages: () => Promise<unknown>;
	onMissedMessagesDelivered: () => Promise<void>;
	recentMessages: () => Promise<unknown>;
};

const lastDispatchInput = () =>
	dispatchSlackAgentMessage.mock.calls.at(-1)?.[0] as DispatchInput;

beforeEach(() => {
	disposition = "close";
	mentionsAgentResult = false;
	mentionsAgent.mockClear();
	skipReply = false;
	shouldSkipReply.mockClear();
	lists = new Map();
	dispatchSlackAgentMessage.mockClear();
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

	test("passes the speaker's name and email to dispatch", async () => {
		disposition = "keep";
		const { thread } = createThread();

		await handleSubscribedSlackMessage(
			thread,
			createMessage({
				author: {
					email: "aneil@example.com",
					fullName: "Aneil Singh",
					isBot: false,
					userId: "U2",
				},
			}),
		);

		expect(dispatchSlackAgentMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				author: { email: "aneil@example.com", name: "Aneil Singh" },
			}),
		);
	});

	test("falls back to the user id when the speaker has no name", async () => {
		disposition = "keep";
		const { thread } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).toHaveBeenCalledWith(
			expect.objectContaining({ author: { email: undefined, name: "U1" } }),
		);
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

	test("skips an untagged reply without reacting, and replays it on the next tag", async () => {
		disposition = "keep";
		const skipped = createMessage({ id: "M2", text: "make it annual" });
		const tagged = createMessage({ id: "M3", text: "<@U_BOT> do the above" });
		const { addReaction, thread } = createThread([skipped, tagged]);

		skipReply = true;
		await handleSubscribedSlackMessage(thread, skipped);

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
		expect(addReaction).not.toHaveBeenCalled();
		expect(getRecentMessages).not.toHaveBeenCalled();

		skipReply = false;
		await handleSubscribedSlackMessage(thread, tagged);

		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
		expect(await lastDispatchInput().missedMessages()).toEqual({
			messages: [{ author: "U1", isBot: false, text: "make it annual" }],
			omittedCount: 0,
		});
		// The missed-message lookup reuses the history the run already loaded.
		await lastDispatchInput().recentMessages();
		expect(getRecentMessages).toHaveBeenCalledTimes(1);

		// Once the turn has run with them, the next mention starts clean.
		await lastDispatchInput().onMissedMessagesDelivered();
		await handleSubscribedSlackMessage(thread, tagged);
		expect(await lastDispatchInput().missedMessages()).toBeUndefined();
	});

	test("ignores bot-authored messages", async () => {
		const { thread } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage({ isBot: true }));

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
		expect(getRecentMessages).not.toHaveBeenCalled();
	});
});

describe("handleSlackMessage", () => {
	test("a new thread never consults the reply mode", async () => {
		skipReply = true;
		const { thread } = createThread();

		await handleSlackThreadStart(thread, createMessage());

		expect(shouldSkipReply).not.toHaveBeenCalled();
		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
	});

	test("a new thread hands over the discussion before the recent window", async () => {
		const history = Array.from({ length: 9 }, (_, index) =>
			createMessage({ id: `H${index}`, text: `message ${index}` }),
		);
		const current = createMessage({ id: "M9", text: "<@U_BOT> do the above" });
		const { thread } = createThread([...history, current]);

		await handleSlackThreadStart(thread, current);

		expect(await lastDispatchInput().missedMessages()).toEqual({
			messages: [
				{ author: "U1", isBot: false, text: "message 0" },
				{ author: "U1", isBot: false, text: "message 1" },
			],
			omittedCount: 0,
		});
	});

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

describe("handleEditedSlackMessage", () => {
	const dispatchedText = () =>
		(dispatchSlackAgentMessage.mock.calls.at(-1)?.[0] as { text: string }).text;

	test("sends an edit in a followed thread to the agent with before and after", async () => {
		disposition = "keep";
		const { thread } = createThread();

		await handleEditedSlackMessage(
			thread,
			createMessage({ text: "deployment abc123" }),
			createMessage({ text: "deployment abc12" }),
		);

		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
		expect(dispatchedText()).toBe(
			"(I edited my earlier message.)\nBefore: deployment abc12\nNow: deployment abc123",
		);
	});

	test("an edit to a stop command reaches dispatch unframed", async () => {
		const { thread } = createThread();

		await handleEditedSlackMessage(
			thread,
			createMessage({ text: "stop replying" }),
			createMessage({ text: "make it annual" }),
		);

		expect(dispatchedText()).toBe("stop replying");
	});

	test("an edit in a followed thread still respects mentions-only mode", async () => {
		skipReply = true;
		const { thread } = createThread();

		await handleEditedSlackMessage(
			thread,
			createMessage({ text: "new" }),
			createMessage({ text: "old" }),
		);

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
	});

	test("ignores an update whose text did not change", async () => {
		const { thread } = createThread();

		await handleEditedSlackMessage(
			thread,
			createMessage({ text: "same" }),
			createMessage({ text: "same" }),
		);

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
	});

	test("ignores bot edits and non-Slack adapters", async () => {
		await handleEditedSlackMessage(
			createThread().thread,
			createMessage({ isBot: true, text: "new" }),
			createMessage({ text: "old" }),
		);
		await handleEditedSlackMessage(
			createThread([], { adapterName: "web" }).thread,
			createMessage({ text: "new" }),
			createMessage({ text: "old" }),
		);

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
	});

	test("answers an edit in a DM", async () => {
		const { thread } = createThread([], { isDM: true, subscribed: false });

		await handleEditedSlackMessage(
			thread,
			createMessage({ text: "new" }),
			createMessage({ text: "old" }),
		);

		expect(mentionsAgent).not.toHaveBeenCalled();
		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
	});

	test("starts a thread when an edit tags the agent in an unfollowed thread", async () => {
		disposition = "keep";
		mentionsAgentResult = true;
		const { subscribe, thread } = createThread([], { subscribed: false });

		await handleEditedSlackMessage(
			thread,
			createMessage({ text: "<@U_BOT> start a trial" }),
			createMessage({ text: "start a trial" }),
		);

		expect(subscribe).toHaveBeenCalledTimes(1);
		expect(dispatchSlackAgentMessage).toHaveBeenCalledWith(
			expect.objectContaining({ showRunPlan: true }),
		);
	});

	test("leaves an untagged edit in an unfollowed thread alone", async () => {
		const { subscribe, thread } = createThread([], { subscribed: false });

		await handleEditedSlackMessage(
			thread,
			createMessage({ text: "new" }),
			createMessage({ text: "old" }),
		);

		expect(subscribe).not.toHaveBeenCalled();
		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
	});
});
