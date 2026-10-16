import type { OpenLock } from "../../models/subject/rows/workerLock.js";

/** Below this many open locks a scan beats keeping buckets; a customer holding seconds of locks at hundreds a second is far past it. */
export const OPEN_LOCK_INDEX_FROM = 256;
const BUCKETS = 256;

type Bucket = readonly OpenLock[];
type Buckets = readonly (Bucket | undefined)[];
/** The same locks twice over, bucketed by row id and by the caller's lock id. */
type OpenLockIndex = { byId: Buckets; byLockId: Buckets };

/**
 * Keyed by the array itself: every mutation makes a new `openLocks`, so an index is exact for as long as its array is read,
 * and the array a mutation makes inherits its parent's index with one bucket changed instead of a rebuild per version.
 */
const indexes = new WeakMap<readonly OpenLock[], OpenLockIndex>();

const bucketOf = (key: string): number => {
	let hash = 0;
	for (let at = 0; at < key.length; at++)
		hash = (hash * 31 + key.charCodeAt(at)) | 0;
	return hash & (BUCKETS - 1);
};

const bucketsOf = ({
	openLocks,
	keyOf,
}: {
	openLocks: readonly OpenLock[];
	keyOf: (openLock: OpenLock) => string;
}): Buckets => {
	const buckets: (OpenLock[] | undefined)[] = new Array(BUCKETS);
	for (const openLock of openLocks) {
		const at = bucketOf(keyOf(openLock));
		const bucket = buckets[at] ?? [];
		bucket.push(openLock);
		buckets[at] = bucket;
	}
	return buckets;
};

const idOf = (openLock: OpenLock) => openLock.id;
const lockIdOf = (openLock: OpenLock) => openLock.lock_id;

const indexOf = (openLocks: readonly OpenLock[]): OpenLockIndex | null => {
	if (openLocks.length < OPEN_LOCK_INDEX_FROM) return null;
	const held = indexes.get(openLocks);
	if (held) return held;
	const index: OpenLockIndex = {
		byId: bucketsOf({ openLocks, keyOf: idOf }),
		byLockId: bucketsOf({ openLocks, keyOf: lockIdOf }),
	};
	indexes.set(openLocks, index);
	return index;
};

const withInBucket = ({
	buckets,
	key,
	openLock,
}: {
	buckets: Buckets;
	key: string;
	openLock: OpenLock;
}): Buckets => {
	const at = bucketOf(key);
	const next = buckets.slice();
	next[at] = [...(buckets[at] ?? []), openLock];
	return next;
};

const withoutInBucket = ({
	buckets,
	key,
	openLock,
}: {
	buckets: Buckets;
	key: string;
	openLock: OpenLock;
}): Buckets => {
	const at = bucketOf(key);
	const next = buckets.slice();
	next[at] = buckets[at]?.filter((held) => held !== openLock);
	return next;
};

/** The open lock with this row id; null when the subject holds none. */
export const findOpenLockById = ({
	openLocks,
	id,
}: {
	openLocks: readonly OpenLock[];
	id: string;
}): OpenLock | null => {
	const index = indexOf(openLocks);
	const candidates = index ? (index.byId[bucketOf(id)] ?? []) : openLocks;
	return candidates.find((openLock) => openLock.id === id) ?? null;
};

/** The open lock the caller's lock id names; null when the subject holds none. */
export const findOpenLockByLockId = ({
	openLocks,
	lockId,
}: {
	openLocks: readonly OpenLock[];
	lockId: string;
}): OpenLock | null => {
	const index = indexOf(openLocks);
	const candidates = index
		? (index.byLockId[bucketOf(lockId)] ?? [])
		: openLocks;
	return candidates.find((openLock) => openLock.lock_id === lockId) ?? null;
};

/** The open locks with this one appended, as `[...openLocks, openLock]` is; the given array is left as it was. */
export const withOpenLock = ({
	openLocks,
	openLock,
}: {
	openLocks: readonly OpenLock[];
	openLock: OpenLock;
}): OpenLock[] => {
	const next = openLocks.slice();
	next.push(openLock);
	const index = indexOf(openLocks);
	if (index)
		indexes.set(next, {
			byId: withInBucket({ buckets: index.byId, key: openLock.id, openLock }),
			byLockId: withInBucket({
				buckets: index.byLockId,
				key: openLock.lock_id,
				openLock,
			}),
		});
	return next;
};

/** The open locks without the one with this row id, in their order, as a filter leaves them; null when none has it. */
export const withoutOpenLock = ({
	openLocks,
	id,
}: {
	openLocks: readonly OpenLock[];
	id: string;
}): OpenLock[] | null => {
	const openLock = findOpenLockById({ openLocks, id });
	if (!openLock) return null;
	const next = openLocks.slice();
	next.splice(next.indexOf(openLock), 1);
	const index = indexOf(openLocks);
	if (index)
		indexes.set(next, {
			byId: withoutInBucket({
				buckets: index.byId,
				key: openLock.id,
				openLock,
			}),
			byLockId: withoutInBucket({
				buckets: index.byLockId,
				key: openLock.lock_id,
				openLock,
			}),
		});
	return next;
};
