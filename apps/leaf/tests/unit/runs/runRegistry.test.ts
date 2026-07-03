import { describe, expect, test } from "bun:test";
import {
	closeRun,
	getRun,
	registerRun,
	runKeyForThread,
} from "../../../src/internal/runs/runRegistry.js";

describe("runRegistry", () => {
	test("builds env-less thread keys", () => {
		expect(
			runKeyForThread({
				channelId: "C1",
				provider: "slack",
				threadId: "171.001",
				workspaceId: "T1",
			}),
		).toBe("slack:T1:C1:171.001");
	});

	test("registers, resolves, and closes runs", () => {
		const run = registerRun({
			key: "k1",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		expect(getRun("k1")).toBe(run);

		closeRun({ key: "k1", run });
		expect(getRun("k1")).toBeUndefined();
		expect(run.closed).toBe(true);
	});

	test("injection is rejected once a run is closed", () => {
		const run = registerRun({
			key: "k1b",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_1");
		closeRun({ key: "k1b", run });

		expect(() => run.injectFollowUp({ text: "late" })).toThrow(
			"Run is closing",
		);
	});

	test("queues follow-ups locally and drains them in order", () => {
		const run = registerRun({
			key: "k1c",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		const notifiedAtCounts: number[] = [];
		run.notifyFollowUpQueued = () => {
			notifiedAtCounts.push(run.pendingTurns);
		};

		run.injectFollowUp({ text: "one" });
		run.injectFollowUp({ text: "two" });

		expect(run.pendingTurns).toBe(2);
		expect(notifiedAtCounts).toEqual([1, 2]);
		expect(run.drainFollowUps()).toEqual(["one", "two"]);
		expect(run.pendingTurns).toBe(0);
		expect(run.drainFollowUps()).toEqual([]);
		closeRun({ key: "k1c", run });
	});

	test("close ignores entries replaced by a newer run", () => {
		const first = registerRun({
			key: "k2",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		const second = registerRun({
			key: "k2",
			kind: "message",
			ownerProviderUserId: "U1",
		});

		closeRun({ key: "k2", run: first });
		expect(getRun("k2")).toBe(second);
		closeRun({ key: "k2", run: second });
	});

	test("requestStop interrupts once and records the first actor", async () => {
		const interrupted: string[] = [];
		const run = registerRun({
			key: "k3",
			kind: "message",
			ownerProviderUserId: "U1",
			sendInterrupt: async (sessionId) => {
				interrupted.push(sessionId);
			},
		});
		run.resolveSessionId("sesn_1");

		const stopPromise = run.requestStop({ byUserId: "U1", reason: "user" });
		expect(run.stop).toEqual({ byUserId: "U1", reason: "user" });

		await run.requestStop({ byUserId: "U2", reason: "timeout" });
		await stopPromise;
		expect(run.stop).toEqual({ byUserId: "U1", reason: "user" });
		expect(interrupted).toEqual(["sesn_1"]);
		closeRun({ key: "k3", run });
	});
});
