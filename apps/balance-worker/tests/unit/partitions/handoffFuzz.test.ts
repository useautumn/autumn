import { expect, test } from "bun:test";
import { KafkaTransactionStateUnknownError } from "@autumn/kafka";
import { partitionLifecycleEventOf } from "../../../src/partitions/lifecycle/partitionLifecycleErrors.js";
import {
	createOwnershipLog,
	createWorker,
	latestClaim,
} from "./handoffFixtures.js";

/**
 * The handoff protocol under random membership schedules: workers join, leave gracefully, are killed outright
 * (heard by the group only after a session timeout) and have runtimes fail, while the group deals partitions by
 * range the way the KIP-848 roster does. Whatever the schedule:
 * - no two live workers are admitted owners of one partition at once;
 * - once the schedule ends, every partition is admitted on exactly the live worker the group dealt it to, and the
 *   ownership topic's newest claim names that worker.
 *
 * Fencing is stubbed here (the producer epoch does it in production), so a killed worker is excluded from the
 * first property: it is the zombie the fence exists for. Replay a failure with FUZZ_SEED; widen with FUZZ_RUNS.
 */

function createRandom(seed: number) {
	let a = seed >>> 0;
	function next(): number {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	const int = (min: number, max: number) =>
		min + Math.floor(next() * (max - min + 1));
	return {
		next,
		int,
		chance: (probability: number) => next() < probability,
		pick: <T>(items: readonly T[]) => items[int(0, items.length - 1)] as T,
	};
}

function seeds(defaultRuns: number): number[] {
	if (process.env.FUZZ_SEED) return [Number(process.env.FUZZ_SEED)];
	const runs = Number(process.env.FUZZ_RUNS ?? defaultRuns);
	const base = Number(process.env.FUZZ_BASE_SEED ?? 1);
	return Array.from({ length: runs }, (_, index) => base + index);
}

type Worker = ReturnType<typeof createWorker>;

async function runSchedule(
	seed: number,
): Promise<{ failures: string[]; trace: string[] }> {
	const random = createRandom(seed);
	const partitionCount = random.int(2, 6);
	const partitions = Array.from(
		{ length: partitionCount },
		(_, index) => index,
	);
	const log = createOwnershipLog();
	const trace: string[] = [];
	const failures: string[] = [];
	const config = {
		handoffReadyTimeoutMs: random.int(10, 60),
		handoffClaimTimeoutMs: random.int(10, 60),
	};
	const everyWorker: Worker[] = [];
	/** Members the group knows of, in join order; the group deals partitions by range over them. */
	let members: Worker[] = [];
	const stopping: Promise<void>[] = [];
	let nextName = 0;

	function rebalance(): void {
		const sorted = [...members].sort((left, right) =>
			left.name.localeCompare(right.name),
		);
		const dealt = new Map<Worker, number[]>();
		for (const worker of sorted) dealt.set(worker, []);
		const share = Math.floor(partitionCount / Math.max(1, sorted.length));
		const extra = partitionCount % Math.max(1, sorted.length);
		let cursor = 0;
		sorted.forEach((worker, index) => {
			const count = share + (index < extra ? 1 : 0);
			dealt.set(worker, partitions.slice(cursor, cursor + count));
			cursor += count;
		});
		trace.push(
			`rebalance ${sorted.map((worker) => `${worker.name}:[${dealt.get(worker)?.join(",")}]`).join(" ")}`,
		);
		// kafkajs's shape, which the runner keeps: everything revoked, then the whole new assignment.
		for (const worker of sorted) {
			worker.revoke();
			worker.assign(dealt.get(worker) ?? []);
		}
	}

	async function join(): Promise<void> {
		const worker = createWorker({ name: `W${nextName++}`, log, config });
		everyWorker.push(worker);
		await worker.ownership.start();
		members.push(worker);
		trace.push(`join ${worker.name}`);
		rebalance();
	}

	function live(): Worker[] {
		return everyWorker.filter((worker) => !worker.isDead());
	}

	function checkSingleOwner(): void {
		for (const partition of partitions) {
			const owners = live().filter((worker) =>
				worker.ownership.isAdmitted({ partition }),
			);
			if (owners.length > 1) {
				const line = `p${partition} admitted on ${owners.map((worker) => worker.name).join(" and ")}`;
				if (!failures.includes(line)) failures.push(line);
			}
		}
	}

	const watcher = setInterval(checkSingleOwner, 1);
	try {
		await join();
		const steps = random.int(4, 12);
		for (let step = 0; step < steps; step++) {
			await Bun.sleep(random.int(0, 40));
			checkSingleOwner();
			const roll = random.next();
			const candidates = members.filter((worker) => !worker.isDead());
			if (roll < 0.35 || candidates.length < 2) {
				if (members.length < 4) await join();
				continue;
			}
			const victim = random.pick(candidates);
			members = members.filter((worker) => worker !== victim);
			if (roll < 0.6) {
				trace.push(`leave ${victim.name}`);
				stopping.push(victim.ownership.stop());
				rebalance();
			} else if (roll < 0.85) {
				trace.push(`kill ${victim.name}`);
				victim.kill();
				// The group hears of a hard death only once the member's session times out.
				const sessionTimeout = random.int(0, 50);
				setTimeout(rebalance, sessionTimeout);
			} else {
				const partition = random.pick(partitions);
				if (random.chance(0.5)) {
					// A cause the worker parks the partition for and retries it alone.
					members.push(victim);
					trace.push(`fail ${victim.name} p${partition} (restartable)`);
					victim.fail(
						partition,
						new KafkaTransactionStateUnknownError({
							failureStage: "commit",
							cause: new Error("timed out"),
						}),
					);
				} else {
					// Any other cause stops the whole service, and the process exits: a leave.
					trace.push(`fail ${victim.name} p${partition} (fatal)`);
					victim.fail(partition);
					stopping.push(victim.ownership.stop());
					rebalance();
				}
			}
		}
		await Bun.sleep(60);
		if (members.length === 0) await join();
		rebalance();

		// Quiescence: every partition admitted on the live worker it was dealt to, and routed there.
		const deadline = performance.now() + 5_000;
		function settled(): string[] {
			const problems: string[] = [];
			const sorted = [...members].sort((left, right) =>
				left.name.localeCompare(right.name),
			);
			const share = Math.floor(partitionCount / sorted.length);
			const extra = partitionCount % sorted.length;
			let cursor = 0;
			sorted.forEach((worker, index) => {
				const count = share + (index < extra ? 1 : 0);
				for (const partition of partitions.slice(cursor, cursor + count)) {
					if (!worker.ownership.isAdmitted({ partition }))
						problems.push(`p${partition} not admitted on ${worker.name}`);
					const claim = latestClaim({ log, partition });
					if (claim?.endpoint !== worker.endpoint)
						problems.push(
							`p${partition} routed to ${claim?.endpoint ?? "nobody"}, dealt to ${worker.name}`,
						);
				}
				cursor += count;
			});
			return problems;
		}
		let problems = settled();
		while (problems.length > 0 && performance.now() < deadline) {
			await Bun.sleep(5);
			problems = settled();
		}
		if (problems.length > 0) {
			failures.push(`never settled: ${problems.slice(0, 3).join("; ")}`);
			if (process.env.FUZZ_EVENTS)
				trace.push(
					`events: ${log.events.filter((event) => event.endsWith(`:${process.env.FUZZ_EVENTS}`) || event.startsWith(`${process.env.FUZZ_WORKER}:`)).join(" ")}`,
					`records: ${log.records
						.filter(
							(record) => String(record.partition) === process.env.FUZZ_EVENTS,
						)
						.map(
							(record) =>
								`${record.type}:${record.endpoint.replace("http://", "")}`,
						)
						.join(" ")}`,
				);
		}
		for (const worker of live())
			// Retirements and cancelled handoffs are routine lifecycle events, which the worker logs as such.
			for (const cause of worker.errors)
				if (!partitionLifecycleEventOf({ cause }))
					failures.push(`${worker.name} reported ${String(cause)}`);
	} finally {
		clearInterval(watcher);
		await Promise.allSettled(
			members
				.filter((worker) => !worker.isDead())
				.map((worker) => worker.ownership.stop()),
		);
		await Promise.race([Promise.allSettled(stopping), Bun.sleep(2_000)]);
	}
	return { failures, trace };
}

test("one admitted owner per partition, and every partition owned once the membership settles", async () => {
	const failed: string[] = [];
	for (const seed of seeds(8)) {
		const { failures, trace } = await runSchedule(seed);
		if (failures.length > 0)
			failed.push(
				`seed ${seed}: ${failures.slice(0, 3).join(" | ")}\n    ${trace.join(" ; ")}`,
			);
	}
	expect(failed).toEqual([]);
}, 120_000);
