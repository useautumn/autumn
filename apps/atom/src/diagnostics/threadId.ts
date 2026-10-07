import { readlinkSync } from "node:fs";

/** The kernel's id for the calling thread, as /proc/self/task lists it; null where /proc is absent. */
export const threadId = (): number | null => {
	try {
		return Number(readlinkSync("/proc/thread-self").split("/").at(-1));
	} catch {
		return null;
	}
};
