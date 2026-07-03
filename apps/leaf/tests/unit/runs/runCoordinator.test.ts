import { describe, expect, test } from "bun:test";
import {
	dispatchThreadMessage,
	isStopMessage,
} from "../../../src/internal/runs/runCoordinator.js";
import {
	closeRun,
	registerRun,
} from "../../../src/internal/runs/runRegistry.js";

describe("isStopMessage", () => {
	test("matches exact stop keywords only", () => {
		expect(isStopMessage("stop")).toBe(true);
		expect(isStopMessage("  STOP!!")).toBe(true);
		expect(isStopMessage("cancel that.")).toBe(true);
		expect(isStopMessage("stop the attach for cus_1")).toBe(false);
		expect(isStopMessage("don't stop")).toBe(false);
	});
});

describe("dispatchThreadMessage", () => {
	test("routes stop keywords to the active run", async () => {
		const interrupts: string[] = [];
		const run = registerRun({
			key: "co1",
			kind: "message",
			ownerProviderUserId: "U1",
			sendInterrupt: async (sessionId) => {
				interrupts.push(sessionId);
			},
		});
		run.resolveSessionId("sesn_1");
		let newRuns = 0;

		await dispatchThreadMessage({
			hasAttachments: false,
			providerUserId: "U1",
			runKey: "co1",
			runNewMessage: async () => {
				newRuns += 1;
			},
			text: "stop",
		});

		expect(run.stop).toEqual({ byUserId: "U1", reason: "user" });
		expect(interrupts).toEqual(["sesn_1"]);
		expect(newRuns).toBe(0);
		closeRun({ key: "co1", run });
	});

	test("queues follow-ups on the active run and notifies the pump", async () => {
		const run = registerRun({
			key: "co2",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_1");
		let notified = 0;
		run.notifyFollowUpQueued = () => {
			notified += 1;
		};
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

		expect(run.pendingTurns).toBe(1);
		expect(notified).toBe(1);
		expect(run.drainFollowUps()).toEqual(["also, what's the MRR?"]);
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

	test("falls back to a new run when injection fails", async () => {
		const run = registerRun({
			key: "co4",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_1");
		// Emulate the close race: the pump closes the run between the
		// coordinator's active check and the inject.
		run.injectFollowUp = () => {
			throw new Error("Run is closing");
		};
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
		const run = registerRun({
			key: "co6",
			kind: "message",
			ownerProviderUserId: "U1",
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

		expect(run.pendingTurns).toBe(0);
		expect(newRuns).toBe(1);
		closeRun({ key: "co6", run });
	});
});
