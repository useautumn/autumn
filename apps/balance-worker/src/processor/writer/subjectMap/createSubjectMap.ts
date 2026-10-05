import type { SubjectState } from "@autumn/balance-engine";
import { timeSync } from "../../../logging/eventLoopStalls/syncSections.js";
import type { SubjectMap } from "./types/subjectMap.js";

/** The bound a map falls back to when no worker budget is handed in: the fixed per-partition size prod ran before the budget existed. */
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

const weigh = ({ value }: { value: unknown }): number =>
	JSON.stringify(value)?.length ?? 0;

const sameKeys = ({
	previous,
	next,
}: {
	previous: object;
	next: object;
}): boolean => {
	const previousKeys = Object.keys(previous);
	const nextKeys = Object.keys(next);
	return (
		previousKeys.length === nextKeys.length &&
		previousKeys.every((key, index) => nextKeys[index] === key)
	);
};

/**
 * The serialised size of `next`, from the size `previous` was known to have
 * and only the parts that changed. A state is replaced, never edited, so a row
 * the mutation left alone is the same object in both, and the serialised text
 * differs by exactly the rows and fields that were replaced.
 */
export const reweighSubjectState = ({
	previous,
	previousBytes,
	next,
}: {
	previous: SubjectState;
	previousBytes: number;
	next: SubjectState;
}): number => {
	if (previous === next) return previousBytes;
	if (!sameKeys({ previous, next })) return weigh({ value: next });
	let bytes = previousBytes;
	for (const key of Object.keys(next) as (keyof SubjectState)[]) {
		const before = previous[key];
		const after = next[key];
		if (before === after) continue;
		if (before === undefined || after === undefined)
			return weigh({ value: next });
		if (
			Array.isArray(before) &&
			Array.isArray(after) &&
			before.length === after.length
		) {
			for (const [index, row] of after.entries()) {
				const previousRow = before[index];
				if (previousRow === row) continue;
				bytes += weigh({ value: row }) - weigh({ value: previousRow });
			}
			continue;
		}
		bytes += weigh({ value: after }) - weigh({ value: before });
	}
	return bytes;
};

export const createSubjectMap = ({
	maxBytes = SUBJECT_MAP_MAX_BYTES,
}: {
	maxBytes?: number | (() => number);
} = {}): SubjectMap => {
	if (typeof maxBytes === "number" && !(maxBytes > 0))
		throw new RangeError("maxBytes must be positive");
	const boundBytes = () =>
		typeof maxBytes === "number" ? maxBytes : maxBytes();
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
		const bound = boundBytes();
		for (const [subjectKey, entry] of entries) {
			if (totalBytes <= bound) return;
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
		const previous = entry.bytes > 0 ? entry.state : null;
		totalBytes -= entry.bytes;
		entry.bytes = timeSync({ label: "subject.weigh" }, () =>
			previous
				? reweighSubjectState({
						previous,
						previousBytes: entry.bytes,
						next: state,
					})
				: weigh({ value: state }),
		);
		entry.state = state;
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
		bytesOf: ({ subjectKey }: { subjectKey: string }) =>
			entries.get(subjectKey)?.bytes || null,
	};
};
