import { deepFreeze } from "../deepFreeze.js";
import type { StoredSubject } from "../types/storedSubject.js";
import { getNativeSubjects, type NativeSubjects } from "./nativeSubjects.js";

const MiB = 1024 * 1024;
/** Row-text bytes this thread keeps parsed of subjects other threads own; 0 parses every read. */
export const NATIVE_READ_CACHE_BYTES = 8 * MiB;

type Cached = { seq: number; subject: StoredSubject; bytes: number };

export type NativeReadCache = {
	/** The shared copy, parsed once per version on this thread; null when its owner holds none. */
	read(params: { key: string }): StoredSubject | null;
	readonly stats: { reads: number; parses: number; absent: number };
	readonly bytes: number;
};

const createNativeReadCache = ({
	native,
	budgetBytes,
}: {
	native: NativeSubjects;
	budgetBytes: number;
}): NativeReadCache => {
	// A Map iterates in insertion order, so re-inserting on each read keeps the least recent first.
	const cached = new Map<string, Cached>();
	const stats = { reads: 0, parses: 0, absent: 0 };
	let bytes = 0;

	function forget(key: string): void {
		const found = cached.get(key);
		if (!found) return;
		cached.delete(key);
		bytes -= found.bytes;
	}

	function keep(key: string, entry: Cached): void {
		if (entry.bytes > budgetBytes) return;
		cached.set(key, entry);
		bytes += entry.bytes;
		for (const [leastRecent] of cached) {
			if (bytes <= budgetBytes) break;
			forget(leastRecent);
		}
	}

	function read({ key }: { key: string }): StoredSubject | null {
		stats.reads += 1;
		const found = cached.get(key);
		const result = native.read({ key, knownSeq: found?.seq ?? 0 });
		if (!result.found) {
			stats.absent += 1;
			forget(key);
			return null;
		}
		if (!result.changed && found) {
			cached.delete(key);
			cached.set(key, found);
			return found.subject;
		}
		if (!result.changed) return null;
		stats.parses += 1;
		forget(key);
		// Frozen, because every check of this version on this thread shares the copy.
		const subject = deepFreeze(result.subject);
		keep(key, { seq: result.seq, subject, bytes: result.bytes });
		return subject;
	}

	return {
		read,
		stats,
		get bytes() {
			return bytes;
		},
	};
};

let readCache: NativeReadCache | null | undefined;

/** This thread's cache of the shared store; null while the store is off. */
export const getNativeReadCache = (): NativeReadCache | null => {
	if (readCache !== undefined) return readCache;
	const native = getNativeSubjects();
	readCache = native
		? createNativeReadCache({ native, budgetBytes: NATIVE_READ_CACHE_BYTES })
		: null;
	return readCache;
};
