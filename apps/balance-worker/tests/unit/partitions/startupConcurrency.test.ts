import { expect, test } from "bun:test";
import { runBoundedStartups } from "../../../src/partitions/lifecycle/startPartitions.js";
import type { PartitionEntry } from "../../../src/partitions/types/partitionState.js";

/** Only `startup` is written by the bounded runner, so the rest can stay absent. */
const entriesFor = (count: number): PartitionEntry[] =>
	Array.from({ length: count }, (_unused, partition) => ({
		partition,
		startup: null,
	})) as unknown as PartitionEntry[];

const tick = (): Promise<void> =>
	new Promise((resolve) => setImmediate(resolve));

test("never starts more partitions at once than the ceiling allows", async () => {
	const entries = entriesFor(512);
	let inFlight = 0;
	let peak = 0;
	let started = 0;

	async function start(): Promise<void> {
		inFlight += 1;
		started += 1;
		peak = Math.max(peak, inFlight);
		await tick();
		inFlight -= 1;
	}

	const results = await runBoundedStartups({ entries, width: 16, start });

	expect(peak).toBe(16);
	expect(started).toBe(512);
	expect(results).toHaveLength(512);
	expect(results.every((result) => result.status === "fulfilled")).toBe(true);
});

test("gives every entry its promise before any of them starts", async () => {
	const entries = entriesFor(64);
	let sawUnassigned = false;

	async function start(): Promise<void> {
		// By the time the first partition begins, the last one already has the
		// promise retirement would await. That is what stops a queued partition
		// being retired against a null startup.
		if (entries.some((entry) => entry.startup === null)) sawUnassigned = true;
		await tick();
	}

	await runBoundedStartups({ entries, width: 4, start });
	expect(sawUnassigned).toBe(false);
});

test("reports a failed startup without leaving its rejection unhandled", async () => {
	const entries = entriesFor(8);
	const boom = new Error("producer fence failed");

	async function start({ entry }: { entry: PartitionEntry }): Promise<void> {
		await tick();
		if (entry.partition === 3) throw boom;
	}

	const results = await runBoundedStartups({ entries, width: 2, start });

	const rejected = results.filter((result) => result.status === "rejected");
	expect(rejected).toHaveLength(1);
	expect((rejected[0] as PromiseRejectedResult).reason).toBe(boom);
	// The caller's own handle rejects with the same cause, which is what
	// retirement catches when it awaits entry.startup.
	await expect(entries[3]?.startup).rejects.toBe(boom);
});

test("runs at least one partition when the ceiling is below one", async () => {
	const entries = entriesFor(3);
	let started = 0;

	async function start(): Promise<void> {
		started += 1;
		await tick();
	}

	await runBoundedStartups({ entries, width: 0, start });
	expect(started).toBe(3);
});
