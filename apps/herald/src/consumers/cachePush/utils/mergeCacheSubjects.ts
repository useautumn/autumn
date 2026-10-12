import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";

const higherVersion = (left: bigint | null, right: bigint | null) => {
	if (left === null) return right;
	if (right === null) return left;
	return left > right ? left : right;
};

/** One push for two refs to the same subject: its newest offset, its oldest change, and its highest version, so coalescing never loses an evict. */
export const mergeCacheSubjects = ({
	held,
	next,
}: {
	held: CacheSubjectRef | undefined;
	next: CacheSubjectRef;
}): CacheSubjectRef => {
	if (!held) return next;
	const newest = held.logOffset >= next.logOffset ? held : next;
	return {
		...newest,
		oldestOccurredAt: Math.min(held.oldestOccurredAt, next.oldestOccurredAt),
		customerVersion: higherVersion(held.customerVersion, next.customerVersion),
	};
};
