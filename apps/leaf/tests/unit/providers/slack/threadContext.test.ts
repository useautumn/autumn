import { describe, expect, mock, test } from "bun:test";
import type { Message, Thread } from "chat";
import { getRecentMessages } from "../../../../src/providers/slack/threadContext.js";

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
