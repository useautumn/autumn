import type pLimit from "p-limit";

export type TestClockQueue = {
	run: ReturnType<typeof pLimit>;
	failedAdvance?: { cause: unknown };
};
