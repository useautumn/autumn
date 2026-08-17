import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Message, Thread } from "chat";
import { createSlackMessageHandlers } from "../../../../src/providers/slack/handlers/handleSlackMessage.js";

let disposition: "close" | "keep" = "close";
let routingDisposition: "ignore" | "respond" | "unsubscribe" = "respond";
const dispatchSlackAgentMessage = mock(async (_input: unknown) => disposition);
const classifySubscribedMessage = mock(async () => routingDisposition);
const recentMessages = [
	{ author: "Autumn", isBot: true, text: "How can I help?" },
];
const getRecentMessages = mock(async () => recentMessages);

const dependencies = {
	classify: classifySubscribedMessage,
	dispatch: dispatchSlackAgentMessage,
	getRecentMessages,
};
const { handleSlackMessage, handleSubscribedSlackMessage } =
	createSlackMessageHandlers(dependencies);

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
	routingDisposition = "respond";
	dispatchSlackAgentMessage.mockClear();
	classifySubscribedMessage.mockClear();
	getRecentMessages.mockClear();
});

describe("handleSubscribedSlackMessage", () => {
	test("dispatches relevant messages with the fetched context", async () => {
		disposition = "keep";
		const { thread, unsubscribe } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(getRecentMessages).toHaveBeenCalledTimes(1);
		expect(dispatchSlackAgentMessage).toHaveBeenCalledTimes(1);
		expect(dispatchSlackAgentMessage).toHaveBeenCalledWith(
			expect.objectContaining({ recentMessages }),
		);
		expect(unsubscribe).not.toHaveBeenCalled();
	});

	test("ignores unrelated messages without unsubscribing", async () => {
		routingDisposition = "ignore";
		const { addReaction, thread, unsubscribe } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
		expect(addReaction).not.toHaveBeenCalled();
		expect(unsubscribe).not.toHaveBeenCalled();
	});

	test("unsubscribes only for explicit opt-out", async () => {
		routingDisposition = "unsubscribe";
		const { thread, unsubscribe } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage());

		expect(dispatchSlackAgentMessage).not.toHaveBeenCalled();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	test("ignores bot-authored messages before classification", async () => {
		const { thread } = createThread();

		await handleSubscribedSlackMessage(thread, createMessage({ isBot: true }));

		expect(classifySubscribedMessage).not.toHaveBeenCalled();
		expect(getRecentMessages).not.toHaveBeenCalled();
	});
});

describe("handleSlackMessage", () => {
	test("unsubscribes when dispatch closes the thread", async () => {
		const { thread, unsubscribe } = createThread();

		await handleSlackMessage(thread, createMessage());

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
