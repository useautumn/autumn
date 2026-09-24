import { expect, test } from "bun:test";
import { seedPartitionLoadFromCheckpoints } from "../../../src/init/seedPartitionLoad.js";
import { createPartitionLoad } from "../../../src/processor/writer/partitionLoad/createPartitionLoad.js";

const sizes = new Map<number, number | null>([
	[0, 800_000],
	[1, 12_000],
	[2, null],
]);

test("seeds each partition with its checkpoint size, counting misses and failures", async () => {
	const partitionLoad = createPartitionLoad({ now: () => 0 });
	const asked: number[] = [];
	const summary = await seedPartitionLoadFromCheckpoints({
		ctx: {
			partitionLoad,
			source: {
				size: async ({ partition }) => {
					asked.push(partition);
					if (partition === 3) throw new Error("bucket unavailable");
					return sizes.get(partition) ?? null;
				},
			},
		},
		config: { topic: "events", partitionCount: 4, concurrency: 2 },
	});
	expect(summary).toEqual({ seeded: 2, missing: 1, failed: 1 });
	expect(asked.sort()).toEqual([0, 1, 2, 3]);
	expect(partitionLoad.snapshot().get(0)).toBe(800_000);
	expect(partitionLoad.snapshot().get(1)).toBe(12_000);
	expect(partitionLoad.snapshot().has(2)).toBe(false);
});

test("a source without sizes, or none at all, seeds nothing and does not throw", async () => {
	const partitionLoad = createPartitionLoad({ now: () => 0 });
	await expect(
		seedPartitionLoadFromCheckpoints({
			ctx: { partitionLoad, source: undefined },
			config: { topic: "events", partitionCount: 4 },
		}),
	).resolves.toEqual({ seeded: 0, missing: 0, failed: 0 });
	await expect(
		seedPartitionLoadFromCheckpoints({
			ctx: { partitionLoad, source: {} },
			config: { topic: "events", partitionCount: 4 },
		}),
	).resolves.toEqual({ seeded: 0, missing: 0, failed: 0 });
	expect(partitionLoad.snapshot().size).toBe(0);
});

test("a slow bucket is abandoned at the deadline; what was read still counts", async () => {
	const partitionLoad = createPartitionLoad({ now: () => 0 });
	const summary = await seedPartitionLoadFromCheckpoints({
		ctx: {
			partitionLoad,
			source: {
				size: ({ partition, signal }) =>
					new Promise((resolve, reject) => {
						if (partition === 0) {
							resolve(500);
							return;
						}
						signal.addEventListener("abort", () => reject(signal.reason), {
							once: true,
						});
					}),
			},
		},
		config: { topic: "events", partitionCount: 3, timeoutMs: 20 },
	});
	expect(summary).toEqual({ seeded: 1, missing: 0, failed: 2 });
	expect(partitionLoad.snapshot().get(0)).toBe(500);
});
