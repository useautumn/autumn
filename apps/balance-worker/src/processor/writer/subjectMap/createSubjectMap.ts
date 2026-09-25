import type { SubjectState } from "@autumn/balance-engine";
import type { SubjectMap } from "./types/subjectMap.js";

/** Per partition writer; a worker holds many partitions, so the fleet total is this × partitions. */
/** How much resident customer state a partition keeps. This is the cache that
 *  decides whether a check costs a millisecond or a Postgres subject load, and
 *  it is replacing a dedicated Redis instance holding gigabytes, so sizing it in
 *  single-digit megabytes left almost every customer cold between visits. At 512
 *  partitions this is 16 GiB across the fleet, under 3 GiB on a worker holding
 *  its ~85 partitions, against the 8 GiB a worker is given. */
export const SUBJECT_MAP_MAX_BYTES = 32 * 1024 * 1024;

type Entry = {
	state: SubjectState;
	/** Set once the entry holds state; a pin-only placeholder has none. */
	customerKey: string | null;
	bytes: number;
	pins: number;
	/** Evicted while a commit was in flight: the rows go as soon as the last pin is released. */
	evictOnUnpin: boolean;
};

export const createSubjectMap = ({
	maxBytes = SUBJECT_MAP_MAX_BYTES,
}: {
	maxBytes?: number;
} = {}): SubjectMap => {
	if (!(maxBytes > 0)) throw new RangeError("maxBytes must be positive");
	// Insertion order is recency: a read re-inserts, eviction walks from the front.
	const entries = new Map<string, Entry>();
	// A customer's subject keys (its own and its entities'), so an evict never walks the partition.
	const subjectKeysByCustomer = new Map<string, Set<string>>();
	let totalBytes = 0;

	const touch = ({
		subjectKey,
		entry,
	}: {
		subjectKey: string;
		entry: Entry;
	}) => {
		entries.delete(subjectKey);
		entries.set(subjectKey, entry);
	};

	const entryOf = ({ subjectKey }: { subjectKey: string }): Entry => {
		const existing = entries.get(subjectKey);
		if (existing) return existing;
		const created: Entry = {
			state: null as unknown as SubjectState,
			customerKey: null,
			bytes: 0,
			pins: 0,
			evictOnUnpin: false,
		};
		entries.set(subjectKey, created);
		return created;
	};

	/** Best effort: pinned subjects and the one just written stay even if the bound is exceeded. */
	const evictUntilWithinBound = ({ except }: { except: string }) => {
		for (const [subjectKey, entry] of entries) {
			if (totalBytes <= maxBytes) return;
			if (entry.pins > 0 || subjectKey === except) continue;
			dropState({ subjectKey, entry });
		}
	};

	const readState = ({ subjectKey }: { subjectKey: string }) => {
		const entry = entries.get(subjectKey);
		if (!entry || entry.bytes === 0) return null;
		touch({ subjectKey, entry });
		return entry.state;
	};

	const index = ({
		subjectKey,
		customerKey,
	}: {
		subjectKey: string;
		customerKey: string;
	}) => {
		const keys = subjectKeysByCustomer.get(customerKey) ?? new Set<string>();
		keys.add(subjectKey);
		subjectKeysByCustomer.set(customerKey, keys);
	};

	const unindex = ({
		subjectKey,
		customerKey,
	}: {
		subjectKey: string;
		customerKey: string;
	}) => {
		const keys = subjectKeysByCustomer.get(customerKey);
		if (!keys) return;
		keys.delete(subjectKey);
		if (keys.size === 0) subjectKeysByCustomer.delete(customerKey);
	};

	const setState = ({
		subjectKey,
		customerKey,
		state,
	}: {
		subjectKey: string;
		customerKey: string;
		state: SubjectState;
	}) => {
		const entry = entryOf({ subjectKey });
		entry.customerKey = customerKey;
		index({ subjectKey, customerKey });
		totalBytes -= entry.bytes;
		entry.state = state;
		entry.bytes = JSON.stringify(state).length;
		totalBytes += entry.bytes;
		touch({ subjectKey, entry });
		evictUntilWithinBound({ except: subjectKey });
	};

	const pin = ({ subjectKey }: { subjectKey: string }) => {
		entryOf({ subjectKey }).pins += 1;
	};

	const dropState = ({
		subjectKey,
		entry,
	}: {
		subjectKey: string;
		entry: Entry;
	}) => {
		totalBytes -= entry.bytes;
		entries.delete(subjectKey);
		if (entry.customerKey !== null)
			unindex({ subjectKey, customerKey: entry.customerKey });
	};

	const unpin = ({ subjectKey }: { subjectKey: string }) => {
		const entry = entries.get(subjectKey);
		if (!entry || entry.pins === 0) return;
		entry.pins -= 1;
		if (entry.pins === 0 && entry.evictOnUnpin)
			dropState({ subjectKey, entry });
	};

	const evictCustomer = ({ customerKey }: { customerKey: string }) => {
		const keys = subjectKeysByCustomer.get(customerKey);
		if (!keys) return;
		for (const subjectKey of [...keys]) {
			const entry = entries.get(subjectKey);
			if (!entry) continue;
			if (entry.pins > 0) entry.evictOnUnpin = true;
			else dropState({ subjectKey, entry });
		}
	};

	const clear = () => {
		entries.clear();
		subjectKeysByCustomer.clear();
		totalBytes = 0;
	};

	return {
		readState,
		setState,
		pin,
		unpin,
		evictCustomer,
		clear,
		sizeBytes: () => totalBytes,
	};
};
