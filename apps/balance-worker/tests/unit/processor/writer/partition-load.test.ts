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

	// A new record is added to the decayed value, not the original.
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
