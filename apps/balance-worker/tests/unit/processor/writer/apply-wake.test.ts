import { describe, expect, test } from "bun:test";
import {
	awaitStored,
	createPartitionWriterState,
	snapshotAllStored,
} from "../../../../src/processor/writer/pendingMutations.js";

const lingeringState = () => {
	const state = createPartitionWriterState();
	let wakes = 0;
	state.applyWake = () => {
		wakes += 1;
	};
	return { state, wakes: () => wakes };
};

describe("only a caller actually waiting on the store wakes a lingering apply", () => {
	test("a store waiter wakes it", () => {
		const { state, wakes } = lingeringState();
		state.lastRowSeq = 1;
		void awaitStored({ state, seq: 1 });
		expect(wakes()).toBe(1);
	});

	test("a write the store already holds needs no wake", async () => {
		const { state, wakes } = lingeringState();
		await awaitStored({ state, seq: 0 });
		expect(wakes()).toBe(0);
	});

	test("a snapshot taken now registers nothing until it is awaited, and then covers only what it saw", () => {
		const { state, wakes } = lingeringState();
		state.lastRowSeq = 3;
		const precedingWrites = snapshotAllStored({ state });
		state.lastRowSeq = 5;
		expect(state.storeWaiters).toEqual([]);
		expect(wakes()).toBe(0);

		void precedingWrites();
		expect(state.storeWaiters.map((waiter) => waiter.seq)).toEqual([3]);
		expect(wakes()).toBe(1);
	});
});
