import { describe, expect, mock, test } from "bun:test";
import type { Message, Thread } from "chat";
import {
	getEarlierThreadMessages,
	getRecentMessages,
	recordSkippedMessage,
	takeMissedMessages,
} from "../../../../src/providers/slack/threadContext.js";

const message = ({
	id,
	isBot = false,
	raw = {},
	text,
}: {
	id: string;
	isBot?: boolean;
	raw?: unknown;
	text: string;
}) =>
	({
		author: { fullName: isBot ? "Autumn" : "Charlie", isBot },
		id,
		raw,
		text,
	}) as Message;

describe("getRecentMessages", () => {
	test("excludes native plan cards from agent context", async () => {
		const current = message({ id: "3", text: "continue" });
		const thread = {
			recentMessages: [
				message({ id: "1", text: "list plans" }),
				message({
					id: "2",
					isBot: true,
					raw: { blocks: [{ type: "plan" }] },
					text: "Loading plans\n- (complete) Preparing request",
				}),
			],
			refresh: mock(async () => {}),
		} as unknown as Thread;

		expect(await getRecentMessages(thread, current)).toEqual([
			{ author: "Charlie", isBot: false, text: "list plans" },
			{ author: "Charlie", isBot: false, text: "continue" },
		]);
	});
});

/** A thread whose state lives in memory, like the Postgres-backed original. */
const statefulThread = (recentMessages: Message[] = []) => {
	let state: Record<string, unknown> | null = null;
	return {
		get state() {
			return Promise.resolve(state);
		},
		recentMessages,
		refresh: mock(async () => {}),
		setState: mock(async (next: Record<string, unknown>) => {
			state = { ...state, ...next };
		}),
	} as unknown as Thread & {
		setState: ReturnType<typeof mock>;
	};
};

describe("skipped replies", () => {
	test("replays skipped replies in order and clears them once taken", async () => {
		const skippedA = message({ id: "2", text: "add a $10 seat add-on" });
		const skippedB = message({ id: "3", text: "and make it annual" });
		const current = message({ id: "4", text: "@Autumn do the above" });
		const thread = statefulThread([
			message({ id: "1", text: "@Autumn set up Pro" }),
			skippedA,
			skippedB,
			current,
		]);

		await recordSkippedMessage(thread, skippedA);
		await recordSkippedMessage(thread, skippedB);

		expect(await takeMissedMessages(thread, current)).toEqual({
			messages: [
				{ author: "Charlie", isBot: false, text: "add a $10 seat add-on" },
				{ author: "Charlie", isBot: false, text: "and make it annual" },
			],
			omittedCount: 0,
		});
		expect(await takeMissedMessages(thread, current)).toBeUndefined();
	});

	test("returns nothing when no reply was skipped", async () => {
		const current = message({ id: "1", text: "@Autumn hi" });

		expect(
			await takeMissedMessages(statefulThread([current]), current),
		).toBeUndefined();
	});

	test("counts skipped replies that fell out of the fetched window", async () => {
		const kept = message({ id: "9", text: "still visible" });
		const current = message({ id: "10", text: "@Autumn do the above" });
		const thread = statefulThread([kept, current]);

		await recordSkippedMessage(thread, message({ id: "1", text: "too old" }));
		await recordSkippedMessage(thread, kept);

		expect(await takeMissedMessages(thread, current)).toEqual({
			messages: [{ author: "Charlie", isBot: false, text: "still visible" }],
			omittedCount: 1,
		});
	});

	test("keeps the newest replies within the character budget", async () => {
		const long = "x".repeat(15_000);
		const older = message({ id: "1", text: long });
		const newer = message({ id: "2", text: long });
		const current = message({ id: "3", text: "@Autumn do the above" });
		const thread = statefulThread([older, newer, current]);

		await recordSkippedMessage(thread, older);
		await recordSkippedMessage(thread, newer);

		const missed = await takeMissedMessages(thread, current);
		expect(missed?.messages.map(({ text }) => text)).toEqual([long]);
		expect(missed?.omittedCount).toBe(1);
	});

	test("remembers at most the 50 latest skipped replies", async () => {
		const thread = statefulThread();
		for (let index = 0; index < 55; index++) {
			await recordSkippedMessage(
				thread,
				message({ id: String(index), text: "chatter" }),
			);
		}

		const state = (await thread.state) as { leafSkippedMessageIds: string[] };
		expect(state.leafSkippedMessageIds).toHaveLength(50);
		expect(state.leafSkippedMessageIds[0]).toBe("5");
	});
});

describe("getEarlierThreadMessages", () => {
	test("returns the discussion older than the recent window", () => {
		const history = Array.from({ length: 10 }, (_, index) =>
			message({ id: String(index), text: `message ${index}` }),
		);
		const current = message({ id: "10", text: "@Autumn do the above" });
		const thread = statefulThread([...history, current]);

		expect(getEarlierThreadMessages(thread, current)).toEqual({
			messages: [
				{ author: "Charlie", isBot: false, text: "message 0" },
				{ author: "Charlie", isBot: false, text: "message 1" },
				{ author: "Charlie", isBot: false, text: "message 2" },
			],
			omittedCount: 0,
		});
	});

	test("returns nothing when the recent window covers the thread", () => {
		const current = message({ id: "2", text: "@Autumn hi" });
		const thread = statefulThread([message({ id: "1", text: "hey" }), current]);

		expect(getEarlierThreadMessages(thread, current)).toBeUndefined();
	});
});
