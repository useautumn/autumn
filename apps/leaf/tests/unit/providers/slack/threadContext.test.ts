import { describe, expect, mock, test } from "bun:test";
import type { Message, StateAdapter, Thread } from "chat";
import {
	getEarlierThreadMessages,
	getRecentMessages,
	loadMissedMessages,
	recordSkippedMessage,
} from "../../../../src/providers/slack/threadContext.js";

const message = ({
	id,
	isBot = false,
	raw = { team_id: "T1" },
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

/** The list half of the Postgres state adapter, in memory. */
const memoryState = () => {
	const lists = new Map<string, unknown[]>();
	return {
		appendToList: async (
			key: string,
			value: unknown,
			options?: { maxLength?: number },
		) => {
			const list = [...(lists.get(key) ?? []), value];
			lists.set(
				key,
				options?.maxLength ? list.slice(-options.maxLength) : list,
			);
		},
		getList: async (key: string) => lists.get(key) ?? [],
		lists,
	} as unknown as StateAdapter & { lists: Map<string, unknown[]> };
};

const threadWith = (recentMessages: Message[] = []) =>
	({ id: "slack:C1:1", recentMessages }) as unknown as Thread;

describe("skipped replies", () => {
	test("replays skipped replies in order until marked delivered", async () => {
		const state = memoryState();
		const skippedA = message({ id: "2", text: "add a $10 seat add-on" });
		const skippedB = message({ id: "3", text: "and make it annual" });
		const current = message({ id: "4", text: "@Autumn do the above" });
		const thread = threadWith([
			message({ id: "1", text: "@Autumn set up Pro" }),
			skippedA,
			skippedB,
			current,
		]);

		await Promise.all([
			recordSkippedMessage(thread, skippedA, state),
			recordSkippedMessage(thread, skippedB, state),
		]);

		const loaded = await loadMissedMessages(thread, current, state);
		expect(loaded?.missed).toEqual({
			messages: [
				{ author: "Charlie", isBot: false, text: "add a $10 seat add-on" },
				{ author: "Charlie", isBot: false, text: "and make it annual" },
			],
			omittedCount: 0,
		});

		// A turn that never ran leaves them for the next mention.
		expect((await loadMissedMessages(thread, current, state))?.missed).toEqual(
			loaded?.missed,
		);

		await loaded?.markDelivered();
		expect(await loadMissedMessages(thread, current, state)).toBeUndefined();
	});

	test("a reply skipped while a turn ran is still replayed afterwards", async () => {
		const state = memoryState();
		const first = message({ id: "1", text: "make it annual" });
		const later = message({ id: "2", text: "use dollars" });
		const current = message({ id: "3", text: "@Autumn go" });
		const thread = threadWith([first, later, current]);

		await recordSkippedMessage(thread, first, state);
		const loaded = await loadMissedMessages(thread, current, state);
		await recordSkippedMessage(thread, later, state);
		await loaded?.markDelivered();

		expect(
			(await loadMissedMessages(thread, current, state))?.missed?.messages,
		).toEqual([{ author: "Charlie", isBot: false, text: "use dollars" }]);
	});

	test("returns nothing when no reply was skipped", async () => {
		const current = message({ id: "1", text: "@Autumn hi" });

		expect(
			await loadMissedMessages(threadWith([current]), current, memoryState()),
		).toBeUndefined();
	});

	test("counts skipped replies that fell out of the fetched window", async () => {
		const state = memoryState();
		const kept = message({ id: "9", text: "still visible" });
		const current = message({ id: "10", text: "@Autumn do the above" });
		const thread = threadWith([kept, current]);

		await recordSkippedMessage(
			thread,
			message({ id: "1", text: "too old" }),
			state,
		);
		await recordSkippedMessage(thread, kept, state);

		expect((await loadMissedMessages(thread, current, state))?.missed).toEqual({
			messages: [{ author: "Charlie", isBot: false, text: "still visible" }],
			omittedCount: 1,
		});
	});

	test("an oversized reply is truncated rather than hiding older ones", async () => {
		const state = memoryState();
		const older = message({ id: "1", text: "use the annual interval" });
		const pasted = message({ id: "2", text: "x".repeat(30_000) });
		const current = message({ id: "3", text: "@Autumn do the above" });
		const thread = threadWith([older, pasted, current]);

		await recordSkippedMessage(thread, older, state);
		await recordSkippedMessage(thread, pasted, state);

		const missed = (await loadMissedMessages(thread, current, state))?.missed;
		expect(missed?.omittedCount).toBe(0);
		expect(missed?.messages[0]?.text).toBe("use the annual interval");
		expect(missed?.messages[1]?.text).toEndWith("…[truncated]");
		expect(missed?.messages[1]?.text.length).toBeLessThan(5000);
	});

	test("keeps the newest replies within the character budget", async () => {
		const state = memoryState();
		const replies = Array.from({ length: 7 }, (_, index) =>
			message({ id: String(index), text: "y".repeat(4000) }),
		);
		const current = message({ id: "7", text: "@Autumn do the above" });
		const thread = threadWith([...replies, current]);

		for (const reply of replies) {
			await recordSkippedMessage(thread, reply, state);
		}

		const missed = (await loadMissedMessages(thread, current, state))?.missed;
		expect(missed?.messages).toHaveLength(5);
		expect(missed?.omittedCount).toBe(2);
	});

	test("replays at most the 50 latest skipped replies", async () => {
		const state = memoryState();
		const replies = Array.from({ length: 55 }, (_, index) =>
			message({ id: String(index), text: "ok" }),
		);
		const current = message({ id: "55", text: "@Autumn do the above" });
		const thread = threadWith([...replies, current]);
		for (const reply of replies) {
			await recordSkippedMessage(thread, reply, state);
		}

		const missed = (await loadMissedMessages(thread, current, state))?.missed;
		expect(missed?.messages).toHaveLength(50);
		expect(missed?.omittedCount).toBe(0);
	});

	test("keeps each workspace's skipped replies apart", async () => {
		const state = memoryState();
		const inOther = message({
			id: "1",
			raw: { team_id: "T2" },
			text: "other workspace",
		});
		const current = message({ id: "2", text: "@Autumn do the above" });
		const thread = threadWith([inOther, current]);

		await recordSkippedMessage(thread, inOther, state);

		expect(await loadMissedMessages(thread, current, state)).toBeUndefined();
	});
});

describe("getEarlierThreadMessages", () => {
	test("returns the discussion older than the recent window", () => {
		const history = Array.from({ length: 10 }, (_, index) =>
			message({ id: String(index), text: `message ${index}` }),
		);
		const current = message({ id: "10", text: "@Autumn do the above" });

		expect(
			getEarlierThreadMessages(threadWith([...history, current]), current),
		).toEqual({
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

		expect(
			getEarlierThreadMessages(
				threadWith([message({ id: "1", text: "hey" }), current]),
				current,
			),
		).toBeUndefined();
	});
});
