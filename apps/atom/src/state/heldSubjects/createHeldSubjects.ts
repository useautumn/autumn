import type { HeldSubject } from "../types/heldSubject.js";
import type { HeldSubjects } from "./types/heldSubjects.js";

/** The balance worker's: a subject nobody read or wrote for this long is dropped, so a quiet Atom's memory falls. */
export const HELD_IDLE_EXPIRY_MS = 4 * 3_600_000;
/** Each hold looks at this many of the least recent entries for idle ones, so a hold's cost is bounded whatever is held. */
export const HELD_IDLE_SCAN_PER_HOLD = 32;

type Entry = HeldSubject & { touchedAt: number };

export const createHeldSubjects = ({
	budgetBytes,
	idleExpiryMs,
	now = () => performance.now(),
}: {
	budgetBytes: number;
	idleExpiryMs?: number;
	now?: () => number;
}): HeldSubjects => {
	// A Map iterates in insertion order, so re-inserting on each read keeps the least recent first.
	const held = new Map<string, Entry>();
	let bytes = 0;
	let lookups = 0;
	let misses = 0;
	let evicted = 0;
	let expired = 0;

	function remove(key: string): Entry | undefined {
		const found = held.get(key);
		if (!found) return undefined;
		held.delete(key);
		bytes -= found.bytes;
		return found;
	}

	function drop(key: string): boolean {
		const found = remove(key);
		found?.release?.();
		return found !== undefined;
	}

	function get(key: string): HeldSubject | undefined {
		lookups += 1;
		const found = held.get(key);
		if (!found) {
			misses += 1;
			return undefined;
		}
		held.delete(key);
		found.touchedAt = now();
		held.set(key, found);
		return found;
	}

	function expireIdle(): void {
		if (idleExpiryMs === undefined) return;
		const idleBefore = now() - idleExpiryMs;
		let scanned = 0;
		for (const [key, entry] of held) {
			if (entry.touchedAt >= idleBefore || scanned === HELD_IDLE_SCAN_PER_HOLD)
				return;
			scanned += 1;
			drop(key);
			expired += 1;
		}
	}

	function hold({ key, ...entry }: { key: string } & HeldSubject) {
		remove(key);
		held.set(key, { ...entry, touchedAt: now() });
		bytes += entry.bytes;
		expireIdle();
		for (const leastRecent of held.keys()) {
			if (bytes <= budgetBytes || leastRecent === key) break;
			drop(leastRecent);
			evicted += 1;
		}
	}

	function dropPrefix(prefix: string): void {
		for (const key of [...held.keys()]) if (key.startsWith(prefix)) drop(key);
	}

	return {
		get,
		hold,
		drop,
		dropPrefix,
		expireIdle,
		get size() {
			return held.size;
		},
		get bytes() {
			return bytes;
		},
		get lookups() {
			return lookups;
		},
		get misses() {
			return misses;
		},
		get evicted() {
			return evicted;
		},
		get expired() {
			return expired;
		},
	};
};
