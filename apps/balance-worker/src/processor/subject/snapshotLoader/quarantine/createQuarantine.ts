import {
	SNAPSHOT_QUARANTINE_AFTER,
	SNAPSHOT_QUARANTINE_CAP,
	SNAPSHOT_QUARANTINE_MS,
} from "../snapshotLoaderLimits.js";

type Entry = { failures: number; until: number | null; warned: boolean };

export type Quarantine = {
	/** True while the subject is shut out; once the window passes, exactly one probe is let through. */
	isShut(params: { subjectKey: string; now: number }): boolean;
	failed(params: { subjectKey: string; now: number }): { entered: boolean };
	succeeded(params: { subjectKey: string }): void;
	size(): number;
};

/** Subjects whose full query keeps failing, so their callers are refused instead of taking a pool slot each time. */
export const createQuarantine = (): Quarantine => {
	// Insertion order is age: a refreshed entry is re-inserted, the cap drops the oldest.
	const entries = new Map<string, Entry>();

	function entryOf({ subjectKey }: { subjectKey: string }): Entry {
		const existing = entries.get(subjectKey);
		if (existing) {
			entries.delete(subjectKey);
			entries.set(subjectKey, existing);
			return existing;
		}
		const created: Entry = { failures: 0, until: null, warned: false };
		entries.set(subjectKey, created);
		if (entries.size > SNAPSHOT_QUARANTINE_CAP)
			entries.delete(entries.keys().next().value as string);
		return created;
	}

	function isShut({ subjectKey, now }: { subjectKey: string; now: number }) {
		const entry = entries.get(subjectKey);
		if (!entry || entry.until === null) return false;
		if (now < entry.until) return true;
		// The window passed: this caller probes; the next waits for the probe's verdict.
		entry.until = now + SNAPSHOT_QUARANTINE_MS;
		return false;
	}

	function failed({ subjectKey, now }: { subjectKey: string; now: number }) {
		const entry = entryOf({ subjectKey });
		entry.failures += 1;
		if (entry.failures < SNAPSHOT_QUARANTINE_AFTER) return { entered: false };
		entry.until = now + SNAPSHOT_QUARANTINE_MS;
		const entered = !entry.warned;
		entry.warned = true;
		return { entered };
	}

	function succeeded({ subjectKey }: { subjectKey: string }) {
		entries.delete(subjectKey);
	}

	return { isShut, failed, succeeded, size: () => entries.size };
};
