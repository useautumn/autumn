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

	test("injects follow-ups into the active run with an interrupt first", async () => {
		const sent: string[] = [];
		const run = registerRun({
			key: "co2",
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

		expect(sent).toEqual(["interrupt", "message:also, what's the MRR?"]);
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
