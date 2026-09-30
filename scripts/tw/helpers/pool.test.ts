import { describe, expect, test } from "bun:test";
import type { WorkerHandle } from "../types.ts";
import { WorkerPool } from "./pool.ts";

const worker = (i: number) =>
	({ name: `w${i}`, inFlight: 0 }) as unknown as WorkerHandle;

describe("WorkerPool at swarm width", () => {
	test("3,000 parked acquires + 2,600 workers joining one by one stays fast", async () => {
		// Like the swarm: the first worker is up before the runner parks every file's acquire.
		const pool = new WorkerPool([worker(0)], 1);
		const granted: Promise<WorkerHandle>[] = [];
		for (let i = 0; i < 3_000; i++) granted.push(pool.acquire());
		const start = performance.now();
		for (let i = 1; i < 2_600; i++) pool.add(worker(i));
		const handed = await Promise.all(granted.slice(0, 2_600));
		expect(new Set(handed.map((w) => w.name)).size).toBe(2_600);
		expect(performance.now() - start).toBeLessThan(1_000);
	}, 20_000);

	test("still prefers a different worker for a retry", async () => {
		const pool = new WorkerPool([worker(1), worker(2)], 1);
		const retry = await pool.acquireDifferentFrom("w1");
		expect(retry.name).toBe("w2");
	});

	test("a strict reschedule waits rather than reusing the avoided worker", async () => {
		const pool = new WorkerPool([worker(1), worker(2)], 1);
		const busy = await pool.acquireDifferentFrom("w1");
		expect(busy.name).toBe("w2");
		let got: WorkerHandle | undefined;
		void pool.acquireDifferentFrom("w1", true).then((w) => {
			got = w;
		});
		await Bun.sleep(5);
		expect(got).toBeUndefined();
		pool.release(busy);
		await Bun.sleep(5);
		expect(got?.name).toBe("w2");
	});
});
