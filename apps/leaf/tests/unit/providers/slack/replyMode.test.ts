import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Message, Thread } from "chat";
import {
	closeRun,
	registerRun,
	runKeyForThread,
} from "../../../../src/internal/runs/runRegistry.js";
import { shouldSkipUntaggedReply as shouldSkip } from "../../../../src/providers/slack/routing/replyMode.js";

type TestInstallation = {
	bot_user_id: string | null;
	provider: string;
	reply_mode: string;
};

let installation: TestInstallation | null;
let lockedInstallation: TestInstallation | undefined;
let lookupError: Error | null = null;
const findSlackInstallationForWorkspace = mock(async () => {
	if (lookupError) throw lookupError;
	return installation;
});
const findLockedInstallation = mock(async () => lockedInstallation);

const shouldSkipUntaggedReply = (input: { message: Message; thread: Thread }) =>
	shouldSkip({
		...input,
		findInstallation:
			findSlackInstallationForWorkspace as unknown as NonNullable<
				Parameters<typeof shouldSkip>[0]["findInstallation"]
			>,
		findLockedInstallation: findLockedInstallation as unknown as NonNullable<
			Parameters<typeof shouldSkip>[0]["findLockedInstallation"]
		>,
	});

const thread = { channelId: "C1", id: "slack:C1:1" } as Thread;

const reply = ({ text, userId = "U1" }: { text: string; userId?: string }) =>
	({
		author: { isBot: false, userId },
		id: "M1",
		raw: { team_id: "T1", text, type: "message" },
		text,
	}) as unknown as Message;

beforeEach(() => {
	installation = {
		bot_user_id: "U_BOT",
		provider: "slack",
		reply_mode: "mentions_only",
	};
	lockedInstallation = undefined;
	lookupError = null;
	findSlackInstallationForWorkspace.mockClear();
	findLockedInstallation.mockClear();
});

describe("shouldSkipUntaggedReply", () => {
	test("skips an untagged reply in mentions-only mode", async () => {
		expect(
			await shouldSkipUntaggedReply({
				message: reply({ text: "make it annual" }),
				thread,
			}),
		).toBe(true);
	});

	test("answers a reply that tags the agent", async () => {
		expect(
			await shouldSkipUntaggedReply({
				message: reply({ text: "<@U_BOT> do the above" }),
				thread,
			}),
		).toBe(false);
	});

	test("skips a reply that tags only someone else", async () => {
		expect(
			await shouldSkipUntaggedReply({
				message: reply({ text: "<@U_ALICE> can you check?" }),
				thread,
			}),
		).toBe(true);
	});

	test("answers every reply in all-messages mode", async () => {
		installation = {
			bot_user_id: "U_BOT",
			provider: "slack",
			reply_mode: "all_messages",
		};

		expect(
			await shouldSkipUntaggedReply({
				message: reply({ text: "make it annual" }),
				thread,
			}),
		).toBe(false);
	});

	test("lets an untagged stop command through", async () => {
		for (const text of ["stop", "stop replying"]) {
			expect(
				await shouldSkipUntaggedReply({ message: reply({ text }), thread }),
			).toBe(false);
		}
		expect(findSlackInstallationForWorkspace).not.toHaveBeenCalled();
	});

	test("passes the run owner's untagged follow-up into a live run", async () => {
		const key = runKeyForThread({
			channelId: thread.channelId,
			provider: "slack",
			threadId: thread.id,
			workspaceId: "T1",
		});
		const run = registerRun({
			key,
			kind: "message",
			ownerProviderUserId: "U1",
		});
		try {
			expect(
				await shouldSkipUntaggedReply({
					message: reply({ text: "actually make it $20" }),
					thread,
				}),
			).toBe(false);
			expect(
				await shouldSkipUntaggedReply({
					message: reply({ text: "sounds good", userId: "U2" }),
					thread,
				}),
			).toBe(true);
			// Settling, the run is about to reply: the correction still counts.
			run.settling = true;
			expect(
				await shouldSkipUntaggedReply({
					message: reply({ text: "actually make it $20" }),
					thread,
				}),
			).toBe(false);
		} finally {
			closeRun({ key, run });
		}

		expect(
			await shouldSkipUntaggedReply({
				message: reply({ text: "actually make it $20" }),
				thread,
			}),
		).toBe(true);
	});

	test("replies when the installation lookup fails", async () => {
		lookupError = new Error("db down");

		expect(
			await shouldSkipUntaggedReply({
				message: reply({ text: "make it annual" }),
				thread,
			}),
		).toBe(false);
	});

	test("an admin reply in a customer thread follows the customer's reply mode", async () => {
		installation = {
			bot_user_id: "U_ADMIN_BOT",
			provider: "slack_admin:client",
			reply_mode: "all_messages",
		};
		lockedInstallation = {
			bot_user_id: "U_CUSTOMER_BOT",
			provider: "slack",
			reply_mode: "mentions_only",
		};

		expect(
			await shouldSkipUntaggedReply({
				message: reply({ text: "don't approve that one" }),
				thread,
			}),
		).toBe(true);
		for (const bot of ["U_CUSTOMER_BOT", "U_ADMIN_BOT"]) {
			expect(
				await shouldSkipUntaggedReply({
					message: reply({ text: `<@${bot}> withdraw it` }),
					thread,
				}),
			).toBe(false);
		}
	});

	test("an admin reply in an unlocked thread keeps the admin reply mode", async () => {
		installation = {
			bot_user_id: "U_ADMIN_BOT",
			provider: "slack_admin:client",
			reply_mode: "all_messages",
		};

		expect(
			await shouldSkipUntaggedReply({
				message: reply({ text: "make it annual" }),
				thread,
			}),
		).toBe(false);
		expect(findLockedInstallation).toHaveBeenCalledTimes(1);
	});

	test("a customer reply never looks up the thread lock", async () => {
		await shouldSkipUntaggedReply({
			message: reply({ text: "make it annual" }),
			thread,
		});
		expect(findLockedInstallation).not.toHaveBeenCalled();
	});
});
