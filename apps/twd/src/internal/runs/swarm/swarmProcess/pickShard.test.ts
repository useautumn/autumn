import { expect, test } from "bun:test";
import { pickShard, type ShardDemand } from "./pickShard.ts";

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
