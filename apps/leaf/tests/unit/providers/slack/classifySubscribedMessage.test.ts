import { describe, expect, mock, test } from "bun:test";
import type { AutumnLogger } from "@autumn/logging";
import { classifySubscribedMessage } from "../../../../src/providers/slack/routing/classifySubscribedMessage.js";

const logger = {
	debug: mock(() => {}),
	error: mock(() => {}),
	info: mock(() => {}),
	warn: mock(() => {}),
} as unknown as AutumnLogger;

const classify = ({
	disposition,
	isMention = false,
}: {
	disposition: "ignore" | "respond" | "unsubscribe";
	isMention?: boolean;
}) =>
	classifySubscribedMessage({
		classify: () => ({ disposition }),
		isMention,
		logger,
		recentMessages: [],
		text: "message",
	});

describe("classifySubscribedMessage", () => {
	test.each(["respond", "ignore", "unsubscribe"] as const)(
		"accepts %s",
		async (disposition) => {
			expect(await classify({ disposition })).toBe(disposition);
		},
	);

	test("responds to an explicit mention classified as unrelated", async () => {
		expect(await classify({ disposition: "ignore", isMention: true })).toBe(
			"respond",
		);
	});

	test("preserves an explicit opt-out when mentioned", async () => {
		expect(
			await classify({ disposition: "unsubscribe", isMention: true }),
		).toBe("unsubscribe");
	});

	test("fails closed without unsubscribing", async () => {
		const disposition = await classifySubscribedMessage({
			classify: () => {
				throw new Error("unavailable");
			},
			isMention: false,
			logger,
			recentMessages: [],
			text: "message",
		});

		expect(disposition).toBe("ignore");
	});
});
