import type { HeldSubject } from "../types/heldSubject.js";
import type { StoredSubject } from "../types/storedSubject.js";
import type { HeldSubjects } from "./types/heldSubjects.js";

/** The balance worker's: a subject nobody read or wrote for this long is dropped, so a quiet Atom's memory falls. */
export const HELD_IDLE_EXPIRY_MS = 4 * 3_600_000;
/** Each hold looks at this many of the least recent entries for idle ones, so a hold's cost is bounded whatever is held. */
export const HELD_IDLE_SCAN_PER_HOLD = 32;
/**
 * Of the row text held, the share kept parsed: the customers the thread is deciding for, found without a parse. A parsed
 * copy takes about five times its text in heap and hundreds of cells the collector marks on every full collection.
 */
export const PARSED_SHARE_OF_HELD = 0.2;
/** Distinct catalog slices held as text: one per plan and catalog version, so a few hundred covers an org. */
const MAX_SLICE_TEXTS = 4_096;

type Entry = HeldSubject & { touchedAt: number };
type SliceText = { catalogJson: string; orgJson: string };

export const createHeldSubjects = ({
	budgetBytes,
	idleExpiryMs,
	parsedBudgetBytes = Math.floor(budgetBytes * PARSED_SHARE_OF_HELD),
	now = () => performance.now(),
}: {
	budgetBytes: number;
	idleExpiryMs?: number;
	parsedBudgetBytes?: number;
	now?: () => number;
}): HeldSubjects => {
	// A Map iterates in insertion order, so re-inserting on each read keeps the least recent first.
	const held = new Map<string, Entry>();
	// The entries holding a parsed copy, least recently read first, so the parsed tier lets go of the coldest.
	const parsed = new Map<string, Entry>();
	const slices = new Map<string, SliceText>();
	let bytes = 0;
	let parsedBytes = 0;
	let lookups = 0;
	let misses = 0;
	let parses = 0;
	let evicted = 0;
	let expired = 0;

	function unparse(key: string, entry: Entry): void {
		if (!parsed.delete(key)) return;
		entry.subject = null;
		parsedBytes -= entry.bytes;
	}

	function drop(key: string): boolean {
		const found = held.get(key);
		if (!found) return false;
		unparse(key, found);
		held.delete(key);
		bytes -= found.bytes;
		return true;
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
		if (found.subject) {
			parsed.delete(key);
			parsed.set(key, found);
		}
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

	/** The entry's parsed copy, as the most recently read; the coldest parsed copies go once the parsed tier is past its budget. */
	function admitParsed({
		key,
		entry,
		subject,
	}: {
		key: string;
		entry: Entry;
		subject: StoredSubject;
	}): void {
		if (!entry.subject) parsedBytes += entry.bytes;
		entry.subject = subject;
		parsed.delete(key);
		parsed.set(key, entry);
		for (const [coldest, cold] of parsed) {
			if (parsedBytes <= parsedBudgetBytes || coldest === key) break;
			unparse(coldest, cold);
		}
	}

	function keepParsed({
		key,
		subject,
	}: {
		key: string;
		subject: StoredSubject;
	}): void {
		const entry = held.get(key);
		if (!entry) return;
		parses += 1;
		admitParsed({ key, entry, subject });
	}

	function hold({
		key,
		text,
		subject,
		bytes: entryBytes,
	}: { key: string } & HeldSubject) {
		drop(key);
		const entry = { text, subject: null, bytes: entryBytes, touchedAt: now() };
		held.set(key, entry);
		bytes += entryBytes;
		if (subject) admitParsed({ key, entry, subject });
		expireIdle();
		for (const leastRecent of held.keys()) {
			if (bytes <= budgetBytes || leastRecent === key) break;
			drop(leastRecent);
			evicted += 1;
		}
	}

	function holdSlice({ hash, ...slice }: { hash: string } & SliceText): void {
		if (slices.has(hash)) return;
		slices.set(hash, slice);
		for (const oldest of slices.keys()) {
			if (slices.size <= MAX_SLICE_TEXTS) break;
			slices.delete(oldest);
		}
	}

	function dropPrefix(prefix: string): void {
		for (const key of [...held.keys()]) if (key.startsWith(prefix)) drop(key);
		if (held.size === 0) slices.clear();
	}

	return {
		get,
		hold,
		keepParsed,
		sliceOf: (hash: string) => slices.get(hash),
		holdSlice,
		drop,
		dropPrefix,
		expireIdle,
		get size() {
			return held.size;
		},
		get bytes() {
			return bytes;
		},
		get parsedSize() {
			return parsed.size;
		},
		get parsedBytes() {
			return parsedBytes;
		},
		get lookups() {
			return lookups;
		},
		get misses() {
			return misses;
		},
		get parses() {
			return parses;
		},
		get evicted() {
			return evicted;
		},
		get expired() {
			return expired;
		},
	};
};
