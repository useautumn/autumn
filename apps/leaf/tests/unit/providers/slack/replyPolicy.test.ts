import { describe, expect, test } from "bun:test";
import { shouldIgnoreUnmentionedReply } from "../../../../src/providers/slack/routing/replyPolicy.js";

const installation = { bot_user_id: "U_BOT", require_mention: true };

describe("shouldIgnoreUnmentionedReply", () => {
	test("never ignores when the installation answers every reply", () => {
		expect(
			shouldIgnoreUnmentionedReply({
				installation: { ...installation, require_mention: false },
				message: { isMention: false, raw: { text: "hello" } },
			}),
		).toBe(false);
	});

	test("ignores an unmentioned reply in mention-only mode", () => {
		expect(
			shouldIgnoreUnmentionedReply({
				installation,
				message: { isMention: false, raw: { text: "hello" } },
			}),
		).toBe(true);
	});

	test("honours the chat SDK mention flag", () => {
		expect(
			shouldIgnoreUnmentionedReply({
				installation,
				message: { isMention: true, raw: { text: "hello" } },
			}),
		).toBe(false);
	});

	test("detects a raw Slack mention of the bot user", () => {
		expect(
			shouldIgnoreUnmentionedReply({
				installation,
				message: { isMention: false, raw: { text: "<@U_BOT|autumn> hi" } },
			}),
		).toBe(false);
	});

	test("treats a mention of another user as unmentioned", () => {
		expect(
			shouldIgnoreUnmentionedReply({
				installation,
				message: { isMention: false, raw: { text: "<@U_OTHER> hi" } },
			}),
		).toBe(true);
	});

	test("answers when the bot user id is unknown", () => {
		expect(
			shouldIgnoreUnmentionedReply({
				installation: { ...installation, bot_user_id: null },
				message: { isMention: false, raw: { text: "hello" } },
			}),
		).toBe(false);
	});
});
