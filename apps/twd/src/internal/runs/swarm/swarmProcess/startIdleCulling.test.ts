import { expect, test } from "bun:test";
import { startIdleCulling } from "./startIdleCulling.ts";

type FakeShard = { name: string; dedicated: boolean; pool: { size: number } };
const shard = (
	name: string,
	overrides: Partial<FakeShard> = {},
): FakeShard => ({
	name,
	dedicated: false,
	pool: { size: 10 },
	...overrides,
});

test("culls every pooled shard, not just the normal pool", () => {
	const shards = [shard("main"), shard("svix")];
	const culling = new Map<FakeShard, () => void>();
	const started: string[] = [];
	startIdleCulling({
		shards,
		culling,
		startCulling: (s) => {
			started.push(s.name);
			return () => {};
		},
	});
	expect(started).toEqual(["main", "svix"]);
	expect(culling.size).toBe(2);
});

test("skips the dedicated shard and pools with no live workers yet, and starts each once", () => {
	const empty = shard("svix", { pool: { size: 0 } });
	const shards = [
		shard("main"),
		empty,
		shard("stripe-connect", { dedicated: true }),
	];
	const culling = new Map<FakeShard, () => void>();
	const started: string[] = [];
	const startCulling = (s: FakeShard) => {
		started.push(s.name);
		return () => {};
	};
	startIdleCulling({ shards, culling, startCulling });
	expect(started).toEqual(["main"]);

	empty.pool.size = 3;
	startIdleCulling({ shards, culling, startCulling });
	expect(started).toEqual(["main", "svix"]);
});
