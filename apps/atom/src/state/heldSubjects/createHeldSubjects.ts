import type { HeldSubject } from "../types/heldSubject.js";
import type { HeldSubjects } from "./types/heldSubjects.js";

export const createHeldSubjects = ({
	budgetBytes,
}: {
	budgetBytes: number;
}): HeldSubjects => {
	// A Map iterates in insertion order, so re-inserting on each read keeps the least recent first.
	const held = new Map<string, HeldSubject>();
	let bytes = 0;

	function drop(key: string): void {
		const found = held.get(key);
		if (!found) return;
		held.delete(key);
		bytes -= found.bytes;
	}

	function get(key: string): HeldSubject | undefined {
		const found = held.get(key);
		if (!found) return undefined;
		held.delete(key);
		held.set(key, found);
		return found;
	}

	function hold({ key, ...entry }: { key: string } & HeldSubject) {
		drop(key);
		held.set(key, entry);
		bytes += entry.bytes;
		for (const leastRecent of held.keys()) {
			if (bytes <= budgetBytes || leastRecent === key) break;
			drop(leastRecent);
		}
	}

	function dropPrefix(prefix: string): void {
		for (const key of [...held.keys()]) if (key.startsWith(prefix)) drop(key);
	}

	return {
		get,
		hold,
		dropPrefix,
		get bytes() {
			return bytes;
		},
	};
};
