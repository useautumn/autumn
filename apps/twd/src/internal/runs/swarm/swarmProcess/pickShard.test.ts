import { expect, test } from "bun:test";
import { pickShard, type ShardDemand, shardShortfall } from "./pickShard.ts";

const shard = (overrides: Partial<ShardDemand>): ShardDemand => ({
	files: ["a", "b", "c"],
	started: 0,
	target: 1,
	provisioning: 0,
	pool: { size: 0 },
	dedicated: false,
	...overrides,
});

test("a pool account never lands on the dedicated stripe-connect shard", () => {
	const stripeConnect = shard({ dedicated: true, target: 1 });
	const normal = shard({ files: ["n1"], target: 5 });
	expect(pickShard([stripeConnect])).toBeUndefined();
	expect(pickShard([stripeConnect, normal])).toBe(normal);
});

test("picks the pooled shard furthest below its share", () => {
	const busy = shard({ pool: { size: 2 }, target: 4 });
	const idle = shard({ pool: { size: 0 }, target: 1 });
	expect(pickShard([busy, idle])).toBe(idle);
	expect(pickShard([shard({ files: ["x"], started: 1 })])).toBeUndefined();
});

test("a packed shard asks for one worker per filesPerWorker waiting files, up to its cap", () => {
	const files = Array.from({ length: 10 }, (_, i) => `f${i}`);
	expect(shardShortfall(shard({ files, filesPerWorker: 3 }))).toBe(4);
	expect(
		shardShortfall(shard({ files, filesPerWorker: 3, maxWorkers: 2 })),
	).toBe(2);
	expect(
		shardShortfall(
			shard({ files, filesPerWorker: 3, maxWorkers: 2, pool: { size: 2 } }),
		),
	).toBe(0);
	expect(shardShortfall(shard({ files, started: 9, filesPerWorker: 3 }))).toBe(
		1,
	);
});
