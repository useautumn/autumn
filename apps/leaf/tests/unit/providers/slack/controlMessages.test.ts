import { describe, expect, mock, test } from "bun:test";
import {
	closeRun,
	registerRun,
} from "../../../../src/internal/runs/runRegistry.js";
import { dispatchSlackAgentMessage } from "../../../../src/providers/slack/actions/dispatchSlackAgentMessage.js";
import { controlMessageFrom } from "../../../../src/providers/slack/routing/controlMessage.js";

const BOT_RAW = "<@U0B66PD6MKQ>";
const BOT_NORMALIZED = "@U0B66PD6MKQ";
const BOT_NAME = "@Autumn Chat Local";

const withEachAddressing = (message: string) => [
	message,
	`${BOT_RAW} ${message}`,
	`${BOT_NORMALIZED} ${message}`,
	`${BOT_NAME} ${message}`,
];

describe("controlMessageFrom", () => {
	const stopMessages = [
		...withEachAddressing("stop"),
		...withEachAddressing("stop now"),
		...withEachAddressing("cancel that"),
		"STOP!!",
		"abort",
	];
	for (const text of stopMessages) {
		test(`stop: ${JSON.stringify(text)}`, () => {
			expect(controlMessageFrom(text)).toBe("stop");
		});
	}

	const optOutMessages = [
		...withEachAddressing("stop replying"),
		...withEachAddressing("stop replying now"),
		...withEachAddressing("don't reply anymore"),
		...withEachAddressing("unsubscribe"),
		"hey autumn stop responding",
	];
	for (const text of optOutMessages) {
		test(`opt_out: ${JSON.stringify(text)}`, () => {
			expect(controlMessageFrom(text)).toBe("opt_out");
		});
	}

	const normalMessages = [
		...withEachAddressing("what plans do we have"),
		...withEachAddressing("cancel the schedule for this customer"),
		...withEachAddressing("stop the trial for cus_123"),
		"list my plans",
		"can you stop the subscription for acme?",
	];
	for (const text of normalMessages) {
		test(`normal: ${JSON.stringify(text)}`, () => {
			expect(controlMessageFrom(text)).toBeNull();
		});
	}
});

describe("dispatchSlackAgentMessage control commands", () => {
	const target = { post: mock(async () => ({ id: "m1" })) };

	const dispatch = ({ text, threadId }: { text: string; threadId: string }) =>
		dispatchSlackAgentMessage({
			channelId: "C9",
			providerUserId: "U1",
			raw: { team_id: "T9" },
			target: target as never,
			text,
			threadId,
		});

	test("opt-out closes the thread and stops the active run", async () => {
		const run = registerRun({
			key: "slack:T9:C9:slack:C9:1",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_1");

		const disposition = await dispatch({
			text: `${BOT_NORMALIZED} stop replying now`,
			threadId: "slack:C9:1",
		});

		expect(disposition).toBe("close");
		expect(run.stop).toEqual({ byUserId: "U1", reason: "user" });
		expect(target.post).not.toHaveBeenCalled();
		closeRun({ key: run.key, run });
	});

	test("bare stop halts the run without unsubscribing or starting a run", async () => {
		const run = registerRun({
			key: "slack:T9:C9:slack:C9:2",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_2");

		const disposition = await dispatch({
			text: `${BOT_NORMALIZED} stop`,
			threadId: "slack:C9:2",
		});

		expect(disposition).toBe("keep");
		expect(run.stop).toEqual({ byUserId: "U1", reason: "user" });
		expect(target.post).not.toHaveBeenCalled();
		closeRun({ key: run.key, run });
	});

	test("stop with no active run stays silent and starts nothing", async () => {
		const disposition = await dispatch({
			text: `${BOT_RAW} stop`,
			threadId: "slack:C9:3",
		});

		expect(disposition).toBe("keep");
		expect(target.post).not.toHaveBeenCalled();
	});
});
