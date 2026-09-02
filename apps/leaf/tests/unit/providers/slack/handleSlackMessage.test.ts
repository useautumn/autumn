import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Message, Thread } from "chat";
import { createSlackMessageHandlers } from "../../../../src/providers/slack/handlers/handleSlackMessage.js";

let disposition: "close" | "keep" = "close";
const dispatchSlackAgentMessage = mock(async (_input: unknown) => disposition);
const recentMessages = [
	{ author: "Autumn", isBot: true, text: "How can I help?" },
];
const getRecentMessages = mock(async () => recentMessages);

const dependencies = {
	dispatch: dispatchSlackAgentMessage,
	getRecentMessages,
};
const {
	handleSlackMessage,
	handleSlackThreadStart,
	handleSubscribedSlackMessage,
} = createSlackMessageHandlers(dependencies);

const createMessage = ({ isBot = false }: { isBot?: boolean } = {}) =>
	({
		author: { isBot, userId: "U1" },
		id: "M1",
		raw: { team_id: "T1" },
		text: "hello",
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
