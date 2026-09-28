import { expect, test } from "bun:test";
import type { ReplayArchiveClock } from "@/internal/balances/replay/operator/replayArchiveContracts.js";
import { runReplayLanes } from "@/internal/balances/replay/operator/replayArchiveSchedule.js";
import { createReplayStartPacer } from "@/internal/balances/replay/operator/replayStartPacer.js";

test("runReplayLanes surfaces a lane failure only after the other lanes settle", async () => {
	const failure = new Error("lane failed");
	const settled: string[] = [];
	let release: (() => void) | undefined;
	const slow = new Promise<void>((resolve) => {
		release = resolve;
	});
	const run = async ({ item }: { item: string }): Promise<void> => {
		if (item === "fails") throw failure;
		await slow;
		settled.push(item);
	};

	let outcome: unknown = "pending";
	const guard = runReplayLanes({
		items: ["slow", "fails"],
		laneCount: 2,
		run,
	}).then(
		() => {
			outcome = "resolved";
		},
		(error: unknown) => {
			outcome = error;
		},
	);

	await Promise.resolve();
	expect(outcome).toBe("pending");
	expect(settled).toEqual([]);

	release?.();
	await guard;
	expect(outcome).toBe(failure);
	expect(settled).toEqual(["slow"]);
});

test("createReplayStartPacer does not start a request when the pacing sleep rejects", async () => {
	const sleepFailure = new Error("sleep failed");
	const clock: ReplayArchiveClock = {
		now: () => 0,
		sleep: () => Promise.reject(sleepFailure),
	};
	const controller = new AbortController();
	const pacer = createReplayStartPacer({
		intervalMs: 50,
		clock,
		signal: controller.signal,
	});

	const first = await pacer.start({ invoke: () => Promise.resolve("first") });
	expect(first).toEqual({ kind: "started", value: "first" });

	let invoked = false;
	const second = pacer.start({
		invoke: async () => {
			invoked = true;
			return "second";
		},
	});

	await expect(second).rejects.toBe(sleepFailure);
	expect(invoked).toBe(false);
});
