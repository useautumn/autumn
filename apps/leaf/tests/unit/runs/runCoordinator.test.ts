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
	test("injects follow-ups into the active run as a steer message", async () => {
		const sent: string[] = [];
		const run = registerRun({
			key: "co2",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: async ({ text }) => {
				sent.push(`message:${text}`);
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
			text: "also, what's the MRR?",
		});

		expect(sent).toEqual(["message:also, what's the MRR?"]);
		expect(run.pendingTurns).toBe(1);
		expect(acked).toBe(1);
		expect(newRuns).toBe(0);
		closeRun({ key: "co2", run });
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
		});
		run.sendInterrupt = async (sessionId) => {
			interrupts.push(sessionId);
		};
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
