import { describe, expect, test } from "bun:test";
import {
	getSlackEventWorkspaceId,
	normalizeSlackEventsBody,
} from "../../../../src/providers/slack/events.js";

describe("Slack event normalization", () => {
	test("normalizes message events that contain a Slack mention", () => {
		const body = JSON.stringify({
			event: {
				channel: "C123",
				text: "<@U123> hello\nworld",
				ts: "1710000000.000",
				type: "message",
				user: "U456",
			},
			team_id: "T123",
			type: "event_callback",
		});

		const normalized = JSON.parse(
			normalizeSlackEventsBody({ body, botUserId: "U123" }),
		);

		expect(normalized.event.type).toBe("app_mention");
		expect(normalized.event.text).toBe("<@U123> hello\nworld");
	});

	test("extracts the workspace id from event envelopes", () => {
		expect(
			getSlackEventWorkspaceId(
				JSON.stringify({ team_id: "T123", type: "event_callback" }),
			),
		).toBe("T123");
	});

	test("preserves native app_mention events", () => {
		const body = JSON.stringify({
			event: { text: "<@U123> hello", type: "app_mention" },
			type: "event_callback",
		});

		expect(normalizeSlackEventsBody({ body, botUserId: "U123" })).toBe(body);
	});

	test("does not normalize message subtypes", () => {
		const body = JSON.stringify({
			event: {
				subtype: "message_changed",
				text: "<@U123> hello",
				type: "message",
			},
			type: "event_callback",
		});

		expect(normalizeSlackEventsBody({ body, botUserId: "U123" })).toBe(body);
	});

	test("does not normalize normal channel messages", () => {
		const body = JSON.stringify({
			event: { text: "hello", type: "message" },
			type: "event_callback",
		});

		expect(normalizeSlackEventsBody({ body, botUserId: "U123" })).toBe(body);
	});

	test("does not normalize other user mentions", () => {
		const body = JSON.stringify({
			event: { text: "<@U999> hello", type: "message" },
			type: "event_callback",
		});

		expect(normalizeSlackEventsBody({ body, botUserId: "U123" })).toBe(body);
	});
});
