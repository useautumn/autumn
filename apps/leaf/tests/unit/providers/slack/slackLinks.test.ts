import { describe, expect, test } from "bun:test";
import { createSlackAdapter } from "@chat-adapter/slack";

const adapter = createSlackAdapter({
	botToken: "xoxb-test",
	signingSecret: "test-secret",
});

const parsedText = (text: string) =>
	adapter.parseMessage({
		channel: "C1",
		text,
		ts: "1700000000.000100",
		type: "message",
		user: "U1",
	}).text;

describe("Slack link text", () => {
	test("keeps the URL behind a shortened link label", () => {
		expect(
			parsedText(
				"check <https://app.useautumn.com/customers/cus_123|app.useautumn.com/customers/…>",
			),
		).toBe(
			"check app.useautumn.com/customers/… (https://app.useautumn.com/customers/cus_123)",
		);
	});

	test("does not repeat a URL its label already shows", () => {
		expect(
			parsedText(
				"see <https://example.com/a|example.com/a> and <https://example.com/b|https://example.com/b>",
			),
		).toBe("see example.com/a and https://example.com/b");
	});

	test("leaves bare links unchanged", () => {
		expect(parsedText("see <https://example.com/a>")).toBe(
			"see https://example.com/a",
		);
	});
});
