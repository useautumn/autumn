import pLimit from "p-limit";
import type { TestClockQueue } from "./types/testClockQueue";

let queues: Map<string, TestClockQueue> | undefined;

export const getTestClockQueue = (testClockId: string): TestClockQueue => {
	queues ??= new Map();
	let queue = queues.get(testClockId);
	if (!queue) {
		queue = { run: pLimit(1) };
		queues.set(testClockId, queue);
	}
	return queue;
};
