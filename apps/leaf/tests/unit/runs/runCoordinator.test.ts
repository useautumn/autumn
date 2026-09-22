import { describe, expect, test } from "bun:test";
import {
	dispatchThreadMessage,
	stopActiveThreadRun,
} from "../../../src/internal/runs/runCoordinator.js";
import {
	closeRun,
	registerRun,
} from "../../../src/internal/runs/runRegistry.js";

describe("dispatchThreadMessage", () => {
	test("posts follow-ups into the active run; the post itself steers", async () => {
		const sent: string[] = [];
		const run = registerRun({
			key: "co2",
			kind: "message",
			ownerProviderUserId: "U1",
			sendInterrupt: async () => {
				sent.push("interrupt");
			},
			sendUserMessage: async ({ speaker, text }) => {
				sent.push(`message:${text}:${speaker?.name ?? "-"}`);
			},
		});
		run.resolveSessionId("sesn_1");
		let acked = 0;
		let newRuns = 0;

		await dispatchThreadMessage({
			hasAttachments: false,
			onFollowUpInjected: () => {
				acked += 1;
			},
			providerUserId: "U1",
			runKey: "co2",
			runNewMessage: async () => {
				newRuns += 1;
			},
			speaker: { mentionsAgent: true, name: "Tony" },
			text: "also, what's the MRR?",
		});

		// No separate interrupt: eve's steer policy cancels the active turn as
		// part of the same durable delivery, so the cancel can't outrun the text.
		expect(sent).toEqual(["message:also, what's the MRR?:Tony"]);
		expect(run.pendingTurns).toBe(1);
		expect(acked).toBe(1);
		expect(newRuns).toBe(0);
		closeRun({ key: "co2", run });
	});

	test("a system notice merges into another sender's active run", async () => {
		const sent: string[] = [];
		const run = registerRun({
			key: "co-notice",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: async ({ speaker, text }) => {
				sent.push(`${text}:${speaker?.name ?? "-"}`);
			},
		});
		run.resolveSessionId("sesn_1");
		let newRuns = 0;

		// Marco approved the card while Tony's message was still running: the
		// applied-outcome notice belongs to the thread, so it rides Tony's turn
		// instead of opening a second reader on the same session.
		await dispatchThreadMessage({
			hasAttachments: false,
			origin: "system",
			providerUserId: "U2",
			runKey: "co-notice",
			runNewMessage: async () => {
				newRuns += 1;
			},
			text: "<approval_applied>…</approval_applied>",
		});

		expect(sent).toEqual(["<approval_applied>…</approval_applied>:-"]);
		expect(newRuns).toBe(0);
		closeRun({ key: "co-notice", run });
	});

	test("a settling run queues the follow-up instead of posting it unread", async () => {
		const sent: string[] = [];
		const run = registerRun({
			key: "co-settling",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: async ({ text }) => {
				sent.push(text);
			},
		});
		run.resolveSessionId("sesn_1");
		// The turn parked for an approval card: the reader returned and the card
		// is being rendered, but the run stays registered until it is posted.
		run.settle();
		let newRuns = 0;

		await dispatchThreadMessage({
			hasAttachments: false,
			providerUserId: "U1",
			runKey: "co-settling",
			runNewMessage: async () => {
				newRuns += 1;
			},
			text: "also bump the seats to 10",
		});

		expect(sent).toEqual([]);
		expect(newRuns).toBe(1);
		expect(run.pendingTurns).toBe(0);
		closeRun({ key: "co-settling", run });
	});

	test("serializes new runs per thread when nothing is active", async () => {
		const order: string[] = [];
		const first = dispatchThreadMessage({
			hasAttachments: false,
			providerUserId: "U1",
			runKey: "co3",
			runNewMessage: async () => {
				order.push("a:start");
				await Bun.sleep(20);
				order.push("a:end");
			},
			text: "first",
		});
		const second = dispatchThreadMessage({
			hasAttachments: false,
			providerUserId: "U1",
			runKey: "co3",
			runNewMessage: async () => {
				order.push("b:start");
			},
			text: "second",
		});

		await Promise.all([first, second]);
		expect(order).toEqual(["a:start", "a:end", "b:start"]);
	});

	test("returns the completed run result", async () => {
		const result = await dispatchThreadMessage({
			hasAttachments: false,
			providerUserId: "U1",
			runKey: "co-result",
			runNewMessage: async () => "close" as const,
			text: "first",
		});

		expect(result).toBe("close");
	});

	test("falls back to a new run when injection fails", async () => {
		const run = registerRun({
			key: "co4",
			kind: "message",
			ownerProviderUserId: "U1",
			sendInterrupt: async () => {
				throw new Error("session busy");
			},
		});
		run.resolveSessionId("sesn_1");
		let newRuns = 0;

		await dispatchThreadMessage({
			hasAttachments: false,
			providerUserId: "U1",
			runKey: "co4",
			runNewMessage: async () => {
				newRuns += 1;
			},
			text: "follow up",
		});

		expect(newRuns).toBe(1);
		expect(run.pendingTurns).toBe(0);
		closeRun({ key: "co4", run });
	});

	test("attachment-bearing follow-ups wait for the active run", async () => {
		const run = registerRun({
			key: "co5",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_1");
		let newRuns = 0;

		await dispatchThreadMessage({
			hasAttachments: true,
			providerUserId: "U1",
			runKey: "co5",
			runNewMessage: async () => {
				newRuns += 1;
			},
			text: "here's the contract",
		});

		expect(newRuns).toBe(1);
		closeRun({ key: "co5", run });
	});

	test("does not inject a different sender's message into the owner's run", async () => {
		const sent: string[] = [];
		const run = registerRun({
			key: "co6",
			kind: "message",
			ownerProviderUserId: "U1",
			sendInterrupt: async () => {
				sent.push("interrupt");
			},
			sendUserMessage: async ({ text }) => {
				sent.push(`message:${text}`);
			},
		});
		run.resolveSessionId("sesn_1");
		let newRuns = 0;

		// A second Slack user posts into the same thread mid-run. It must not be
		// injected into U1's authenticated session — it starts its own run.
		await dispatchThreadMessage({
			hasAttachments: false,
			providerUserId: "U2",
			runKey: "co6",
			runNewMessage: async () => {
				newRuns += 1;
			},
			text: "attach the enterprise plan to cus_1",
		});

		expect(sent).toEqual([]);
		expect(run.pendingTurns).toBe(0);
		expect(newRuns).toBe(1);
		closeRun({ key: "co6", run });
	});
});

describe("stopActiveThreadRun", () => {
	test("stops the thread's active run", async () => {
		const interrupts: string[] = [];
		const run = registerRun({
			key: "co-opt-out",
			kind: "message",
			ownerProviderUserId: "U1",
			sendInterrupt: async (sessionId) => {
				interrupts.push(sessionId);
			},
		});
		run.resolveSessionId("sesn_opt_out");

		const stopped = await stopActiveThreadRun({
			byUserId: "U2",
			runKey: "co-opt-out",
		});

		expect(stopped).toBe(true);
		expect(run.stop).toEqual({ byUserId: "U2", reason: "user" });
		expect(interrupts).toEqual(["sesn_opt_out"]);
		closeRun({ key: "co-opt-out", run });
	});

	test("returns false when the thread has no active run", async () => {
		expect(
			await stopActiveThreadRun({ byUserId: "U1", runKey: "co-none" }),
		).toBe(false);
	});
});
