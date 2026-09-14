import { describe, expect, test } from "bun:test";
import {
	getSlackEventWorkspaceId,
	normalizeSlackEventsBody,
	slackMentionedUserIds,
	slackMessageMentionsUser,
	slackSpeakerMentions,
} from "../../../../src/providers/slack/events.js";

describe("slackSpeakerMentions", () => {
	test("classifies mentions against the bot id", () => {
		expect(
			slackSpeakerMentions({ botUserId: "UBOT", mentionedUserIds: ["UBOT"] }),
		).toEqual({ mentionsAgent: true, mentionsOthers: false });
		expect(
			slackSpeakerMentions({ botUserId: "UBOT", mentionedUserIds: ["U1"] }),
		).toEqual({ mentionsAgent: false, mentionsOthers: true });
		expect(
			slackSpeakerMentions({
				botUserId: "UBOT",
				mentionedUserIds: ["U1", "UBOT"],
			}),
		).toEqual({ mentionsAgent: true, mentionsOthers: true });
	});

	test("sets neither flag when the bot id is unknown", () => {
		// A mention of the bot itself must not read as "someone else".
		expect(
			slackSpeakerMentions({ botUserId: null, mentionedUserIds: ["UBOT"] }),
		).toEqual({ mentionsAgent: false, mentionsOthers: false });
		expect(
			slackSpeakerMentions({ botUserId: undefined, mentionedUserIds: [] }),
		).toEqual({ mentionsAgent: false, mentionsOthers: false });
	});
});

describe("slackMentionedUserIds", () => {
	test("lists every mentioned user once, in order", () => {
		expect(
			slackMentionedUserIds({
				raw: { text: "<@U1|ayush> lol <@W2> sorry <@U1>", type: "message" },
			}),
		).toEqual(["U1", "W2"]);
	});

	test("returns nothing for messages without mentions or text", () => {
		expect(slackMentionedUserIds({ raw: { text: "hello" } })).toEqual([]);
		expect(slackMentionedUserIds({ raw: { text: 42 } })).toEqual([]);
		expect(slackMentionedUserIds({ raw: null })).toEqual([]);
	});
});

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

describe("slackMessageMentionsUser", () => {
	test("distinguishes another Slack app with a longer display name", () => {
		expect(
			slackMessageMentionsUser({
				raw: { text: "<@U_LOCAL> attach growth_seed" },
				userId: "U_PROD",
			}),
		).toBe(false);
		expect(
			slackMessageMentionsUser({
				raw: { text: "<@U_PROD> attach growth_seed" },
				userId: "U_PROD",
			}),
		).toBe(true);
	});
});
