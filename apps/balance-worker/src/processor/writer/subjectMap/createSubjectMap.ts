import type { SubjectState } from "@autumn/balance-engine";
import { timeSync } from "../../../logging/eventLoopStalls/syncSections.js";
import type {
	SubjectDropReason,
	SubjectEvictReason,
} from "./types/subjectDropReason.js";
import type {
	OnSubjectEvicted,
	ResidentDrop,
	SubjectMap,
} from "./types/subjectMap.js";

/** The bound a map falls back to when no worker budget is handed in: the fixed per-partition size prod ran before the budget existed. */
export const SUBJECT_MAP_MAX_BYTES = 32 * 1024 * 1024;

export const SUBJECT_MAP_IDLE_SCAN_PER_WRITE = 32;

type Entry = {
	state: SubjectState;
	/** Set once the entry holds state; a pin-only placeholder has none. */
	customerKey: string | null;
	bytes: number;
	pins: number;
	/** Evicted while a write was unapplied: unreadable at once, the entry goes as soon as the last pin is released. */
	evictOnUnpin: SubjectEvictReason | null;
	baselineAt: number | null;
	/** Last read or write, on the map's clock. */
	touchedAt: number;
};

const isHidden = ({ entry }: { entry: Entry }): boolean =>
	entry.bytes === 0 && entry.customerKey !== null;

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
	onEvicted,
	idleExpiryMs,
	now = () => performance.now(),
}: {
	maxBytes?: number | (() => number);
	onEvicted?: OnSubjectEvicted;
	idleExpiryMs?: number;
	now?: () => number;
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
	let residentSubjects = 0;
	const droppedSubjects: Record<SubjectDropReason, number> = {
		capacity: 0,
		idle: 0,
		evict: 0,
		stale: 0,
		storeRejected: 0,
		coldStart: 0,
	};

	const touch = ({
		subjectKey,
		entry,
	}: {
		subjectKey: string;
		entry: Entry;
	}) => {
		entry.touchedAt = now();
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
			evictOnUnpin: null,
			baselineAt: null,
			touchedAt: now(),
		};
		entries.set(subjectKey, created);
		return created;
	};

	/** Best effort: pinned subjects and the one just written stay even if the bound is exceeded. */
	const evictUntilWithinBound = ({ except }: { except: string }) => {
		const bound = boundBytes();
		for (const [subjectKey, entry] of entries) {
			if (totalBytes <= bound) return;
			if (entry.pins > 0 || isHidden({ entry }) || subjectKey === except)
				continue;
			dropState({ subjectKey, entry, reason: "capacity" });
		}
	};

	const dropIdle = () => {
		if (idleExpiryMs === undefined) return;
		const idleBefore = now() - idleExpiryMs;
		let scanned = 0;
		for (const [subjectKey, entry] of entries) {
			const isIdle = entry.touchedAt < idleBefore;
			if (!isIdle || scanned === SUBJECT_MAP_IDLE_SCAN_PER_WRITE) return;
			scanned += 1;
			if (entry.pins > 0 || isHidden({ entry })) touch({ subjectKey, entry });
			else dropState({ subjectKey, entry, reason: "idle" });
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
		baselineAt,
	}: {
		subjectKey: string;
		customerKey: string;
		state: SubjectState;
		baselineAt?: number;
	}) => {
		const entry = entryOf({ subjectKey });
		entry.customerKey = customerKey;
		if (baselineAt !== undefined) entry.baselineAt = baselineAt;
		index({ subjectKey, customerKey });
		const previous = entry.bytes > 0 ? entry.state : null;
		if (previous === null) residentSubjects += 1;
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
		dropIdle();
		evictUntilWithinBound({ except: subjectKey });
	};

	const pin = ({ subjectKey }: { subjectKey: string }) => {
		entryOf({ subjectKey }).pins += 1;
	};

	const dropState = ({
		subjectKey,
		entry,
		reason,
	}: {
		subjectKey: string;
		entry: Entry;
		reason: SubjectDropReason;
	}) => {
		if (entry.bytes > 0) residentSubjects -= 1;
		totalBytes -= entry.bytes;
		entries.delete(subjectKey);
		if (entry.customerKey === null) return;
		droppedSubjects[reason] += 1;
		unindex({ subjectKey, customerKey: entry.customerKey });
	};

	const unpin = ({ subjectKey }: { subjectKey: string }) => {
		const entry = entries.get(subjectKey);
		if (!entry || entry.pins === 0) return;
		entry.pins -= 1;
		if (entry.pins === 0 && entry.evictOnUnpin) {
			dropState({ subjectKey, entry, reason: entry.evictOnUnpin });
			// Once per pinned subject, so the DELETE follows the last record that read it; the batcher dedupes.
			if (entry.customerKey !== null)
				onEvicted?.({ customerKey: entry.customerKey });
		}
	};

	const readBaselineAt = ({ subjectKey }: { subjectKey: string }) =>
		entries.get(subjectKey)?.baselineAt ?? null;

	const readBytes = ({ subjectKey }: { subjectKey: string }) =>
		entries.get(subjectKey)?.bytes ?? 0;

	// Only an evict's drops reach `onEvicted`: a drop for space leaves rows Postgres still holds true.
	const evictCustomer = ({
		customerKey,
		reason,
	}: {
		customerKey: string;
		reason: SubjectEvictReason;
	}) => {
		let pinned = 0;
		for (const subjectKey of [
			...(subjectKeysByCustomer.get(customerKey) ?? []),
		]) {
			const entry = entries.get(subjectKey);
			if (!entry) continue;
			if (entry.pins === 0) {
				dropState({ subjectKey, entry, reason });
				continue;
			}
			hide({ entry });
			entry.evictOnUnpin ??= reason;
			pinned += 1;
		}
		if (pinned === 0) onEvicted?.({ customerKey });
	};

	/** Unreadable at once; the entry stays indexed until an unpin or `evictCustomer` drops it. */
	const hide = ({ entry }: { entry: Entry }) => {
		if (entry.bytes > 0) residentSubjects -= 1;
		totalBytes -= entry.bytes;
		entry.state = null as unknown as SubjectState;
		entry.bytes = 0;
		entry.baselineAt = null;
	};

	const hideCustomer = ({ customerKey }: { customerKey: string }) => {
		for (const subjectKey of subjectKeysByCustomer.get(customerKey) ?? []) {
			const entry = entries.get(subjectKey);
			if (entry) hide({ entry });
		}
	};

	// Only a hidden entry is indexed with nothing resident: a pin-only placeholder is never indexed.
	const isEvicting = ({ customerKey }: { customerKey: string }) =>
		[...(subjectKeysByCustomer.get(customerKey) ?? [])].some(
			(subjectKey) => entries.get(subjectKey)?.bytes === 0,
		);

	/** As a restart would: each resident subject `drops` picks goes unless a pin holds an unapplied write; hidden ones stay with their writes. */
	const dropResident: SubjectMap["dropResident"] = ({ drops }) => {
		const result: ResidentDrop = { evicted: 0, kept: 0, resident: 0 };
		const nowMs = now();
		for (const [subjectKey, entry] of [...entries]) {
			if (entry.bytes === 0 || entry.customerKey === null) continue;
			if (
				!drops({
					customerKey: entry.customerKey,
					idleMs: nowMs - entry.touchedAt,
				})
			)
				result.kept += 1;
			else if (entry.pins > 0) result.resident += 1;
			else {
				dropState({ subjectKey, entry, reason: "coldStart" });
				result.evicted += 1;
			}
		}
		return result;
	};

	const clear = () => {
		entries.clear();
		subjectKeysByCustomer.clear();
		totalBytes = 0;
		residentSubjects = 0;
	};

	const readUsage = () => ({
		residentSubjects,
		residentBytes: totalBytes,
		droppedSubjects: { ...droppedSubjects },
	});

	return {
		readState,
		setState,
		readBaselineAt,
		readBytes,
		pin,
		unpin,
		evictCustomer,
		hideCustomer,
		isEvicting,
		dropResident,
		clear,
		sizeBytes: () => totalBytes,
		bytesOf: ({ subjectKey }: { subjectKey: string }) =>
			entries.get(subjectKey)?.bytes || null,
		readUsage,
	};
};
