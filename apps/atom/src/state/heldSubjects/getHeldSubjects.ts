import { createHeldSubjects } from "./createHeldSubjects.js";
import type { HeldSubjects } from "./types/heldSubjects.js";

/** Row text held parsed per thread; each owns its slots' subjects, so one budget covers them all. */
const HELD_BYTES_PER_THREAD = 256 * 1024 * 1024;

let heldSubjects: HeldSubjects | undefined;

/** One per thread: module state is the thread's own. */
export const getHeldSubjects = (): HeldSubjects => {
	heldSubjects ??= createHeldSubjects({ budgetBytes: HELD_BYTES_PER_THREAD });
	return heldSubjects;
};
