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

	test("injection is rejected once a run is closed", async () => {
		const run = registerRun({
			key: "k1b",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_1");
		closeRun({ key: "k1b", run });

		expect(run.injectFollowUp({ text: "late" })).rejects.toThrow(
			"Run is closing",
		);
	});

	test("a transport bound with the session id carries follow-ups", async () => {
		const sent: string[] = [];
		const run = registerRun({
			key: "k1c",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		// The Slack path registers before it knows the session; the turn binds
		// the transport once eve has answered.
		run.resolveSessionId("sesn_1", {
			sendUserMessage: async ({ sessionId, text }) => {
				sent.push(`${sessionId}:${text}`);
			},
		});

		await run.injectFollowUp({ text: "late enough" });

		expect(sent).toEqual(["sesn_1:late enough"]);
		expect(run.pendingTurns).toBe(1);
		closeRun({ key: "k1c", run });
	});

	test("injection is rejected once the run settles", async () => {
		const run = registerRun({
			key: "k1d",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: async () => undefined,
		});
		run.resolveSessionId("sesn_1");
		run.settle();

		expect(run.injectFollowUp({ text: "unread" })).rejects.toThrow(
			"Run is settling",
		);
		expect(run.pendingTurns).toBe(0);
		closeRun({ key: "k1d", run });
	});

	test("claims accepted follow-ups, or shuts the run, in one step", () => {
		const run = registerRun({
			key: "k1e",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: async () => undefined,
		});
		run.resolveSessionId("sesn_1");

		// eve folds adjacent messages into one replacement turn, so a claim
		// takes every message accepted so far rather than one per boundary.
		run.pendingTurns = 2;
		expect(run.claimFollowUpsOrSettle()).toBe(true);
		expect(run.pendingTurns).toBe(0);
		expect(run.settling).toBeUndefined();

		// Nothing outstanding: the same call is what closes the run, so there is
		// no moment where a message can be accepted by a reader that has left.
		expect(run.claimFollowUpsOrSettle()).toBe(false);
		expect(run.settling).toBe(true);
		expect(run.injectFollowUp({ text: "too late" })).rejects.toThrow(
			"Run is settling",
		);
		closeRun({ key: "k1e", run });
	});

	test("only a turn start after a cancel covers accepted follow-ups", async () => {
		const accepts: Array<() => void> = [];
		const run = registerRun({
			key: "k1f",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: () =>
				new Promise<void>((resolve) => {
					accepts.push(resolve);
				}),
		});
		run.resolveSessionId("sesn_1");

		const accepted = run.injectFollowUp({ text: "folded" });
		const inFlight = run.injectFollowUp({ text: "still posting" });
		await Bun.sleep(0);
		accepts[0]?.();
		await accepted;

		// A start with no cancel after the accept may be a turn that predates
		// the message, so it covers nothing.
		run.coverAcceptedFollowUps();
		expect(run.pendingTurns).toBe(2);

		// The cancel the accepted one caused arms it; the replacement's start
		// covers it. The other was still posting at the cancel, so stays owed.
		run.noteTurnCancelled();
		run.coverAcceptedFollowUps();
		expect(run.pendingTurns).toBe(1);

		// A claim hands the in-flight post to the reader. Its accept landing
		// afterwards was already counted, so a later turn start must not use it
		// to cover a message injected after the claim.
		expect(run.claimFollowUpsOrSettle()).toBe(true);
		accepts[1]?.();
		await inFlight;
		const later = run.injectFollowUp({ text: "after the claim" });
		await Bun.sleep(0);
		run.noteTurnCancelled();
		run.coverAcceptedFollowUps();
		expect(run.pendingTurns).toBe(1);

		accepts[2]?.();
		await later;
		closeRun({ key: "k1f", run });
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

		await run.requestStop({ byUserId: "U2", reason: "user" });
		await stopPromise;
		expect(run.stop).toEqual({ byUserId: "U1", reason: "user" });
		expect(interrupted).toEqual(["sesn_1"]);
		closeRun({ key: "k3", run });
	});
});
