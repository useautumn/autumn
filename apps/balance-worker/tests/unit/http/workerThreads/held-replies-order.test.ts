import { expect, spyOn, test } from "bun:test";
import { createHeldReplies } from "../../../../src/http/workerThreads/heldReplies/createHeldReplies.js";

test("a failure published between the reader's two loads fails the held reply instead of releasing it past the gap", () => {
	const partition = 1;
	const cells = new SharedArrayBuffer(4 * 8);
	const failureCounts = new SharedArrayBuffer(4 * 4);
	const positions = new BigInt64Array(cells);
	const failures = new Int32Array(failureCounts);
	Atomics.store(positions, partition, 5n);
	const replies = createHeldReplies({ commitCells: cells, failureCounts });
	const outcomes: string[] = [];
	replies.hold({
		partition,
		seq: 7,
		answer: () => outcomes.push("released"),
		fail: ({ status }) => outcomes.push(`failed ${status}`),
	});
	const realLoad = Atomics.load.bind(Atomics) as (
		array: BigInt64Array | Int32Array,
		index: number,
	) => number | bigint;
	let interleaved = false;
	const load = spyOn(Atomics, "load").mockImplementation(((
		array: BigInt64Array | Int32Array,
		index: number,
	) => {
		const value = realLoad(array, index);
		if (!interleaved) {
			interleaved = true;
			// The writer fails (5, 10] and moves past the gap while the reader is between its loads.
			Atomics.add(failures, partition, 1);
			Atomics.store(positions, partition, 11n);
		}
		return value;
	}) as typeof Atomics.load);
	try {
		replies.release();
	} finally {
		load.mockRestore();
	}
	replies.fail({
		partition,
		aboveSeq: 5,
		lastSeq: 10,
		status: 500,
		body: new Uint8Array(),
	});
	expect(outcomes).toEqual(["failed 500"]);
});
