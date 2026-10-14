import { expect, test } from "bun:test";
import { createPartitionLoad } from "../../../../src/processor/writer/partitionLoad/createPartitionLoad.js";

test("committed bytes accumulate and halve every half-life", () => {
	let clock = 0;
	const load = createPartitionLoad({ now: () => clock, halfLifeMs: 1_000 });
	load.record({ partition: 3, bytes: 800 });
	load.record({ partition: 3, bytes: 200 });
	load.record({ partition: 9, bytes: 100 });
	expect(load.snapshot().get(3)).toBe(1_000);

	clock = 1_000;
	expect(load.snapshot().get(3)).toBeCloseTo(500);
	expect(load.snapshot().get(9)).toBeCloseTo(50);

	load.record({ partition: 3, bytes: 100 });
	expect(load.snapshot().get(3)).toBeCloseTo(600);
	clock = 3_000;
	expect(load.snapshot().get(3)).toBeCloseTo(150);
});

test("a released partition is forgotten and bad input is refused", () => {
	const load = createPartitionLoad({ now: () => 0 });
	load.record({ partition: 1, bytes: 10 });
	load.forget({ partition: 1 });
	expect(load.snapshot().size).toBe(0);
	expect(() => load.record({ partition: 1, bytes: -1 })).toThrow(RangeError);
	expect(() => createPartitionLoad({ now: () => 0, halfLifeMs: 0 })).toThrow(
		RangeError,
	);
});

test("a claimed partition is owned until released; its weight outlives the release", () => {
	const load = createPartitionLoad({ now: () => 0 });
	load.claim({ partition: 4 });
	load.claim({ partition: 9 });
	load.record({ partition: 9, bytes: 50 });
	expect([...load.owned()].sort()).toEqual([4, 9]);
	load.release({ partition: 9 });
	expect([...load.owned()]).toEqual([4]);
	expect(load.snapshot().get(9)).toBe(50);
});

test("the latest assignment is reported until the next replaces it, and nothing before the first", () => {
	const load = createPartitionLoad({ now: () => 0 });
	expect(load.assigned()).toBeUndefined();
	load.assign({ partitions: [9, 4] });
	expect([...(load.assigned() ?? [])].sort()).toEqual([4, 9]);
	load.assign({ partitions: [] });
	expect(load.assigned()?.size).toBe(0);
});

test("a partition given up while still assigned is not reported as assigned until it is claimed again", () => {
	const load = createPartitionLoad({ now: () => 0 });
	load.assign({ partitions: [4, 9] });
	load.claim({ partition: 4 });
	load.claim({ partition: 9 });
	load.release({ partition: 4 });
	expect([...(load.assigned() ?? [])].sort()).toEqual([4, 9]);
	load.relinquish({ partition: 9 });
	expect([...(load.assigned() ?? [])]).toEqual([4]);
	load.claim({ partition: 9 });
	expect([...(load.assigned() ?? [])].sort()).toEqual([4, 9]);
	load.relinquish({ partition: 9 });
	load.assign({ partitions: [9] });
	expect([...(load.assigned() ?? [])]).toEqual([9]);
});
