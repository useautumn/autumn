import type { FullSubject } from "@autumn/shared";
import { LRUCache } from "lru-cache";

export const SUBJECT_READ_L1_MAX_ENTRIES = 2000;

/** Pathological accounts carry millions of customer products; caching those
 *  blobs would blow the entry-count sizing, so they get singleflight only. */
export const SUBJECT_READ_L1_MAX_CACHEABLE_ITEMS = 10_000;

const isCacheableSize = (fullSubject: FullSubject): boolean =>
	(fullSubject.customer_products?.length ?? 0) +
		(fullSubject.extra_customer_entitlements?.length ?? 0) +
		(fullSubject.aggregated_customer_products?.length ?? 0) <
	SUBJECT_READ_L1_MAX_CACHEABLE_ITEMS;

const inFlight = new Map<string, Promise<FullSubject>>();

/** Per-process L1 over post-sanitize FullSubjects. Entries are shared across
 *  callers — treat them as frozen, never mutate. */
const subjectReadL1 = new LRUCache<string, FullSubject>({
	max: SUBJECT_READ_L1_MAX_ENTRIES,
});

export const _resetSubjectReadL1ForTesting = () => {
	subjectReadL1.clear();
	inFlight.clear();
};

export const _subjectReadL1SizeForTesting = () => subjectReadL1.size;
export const _subjectReadInFlightSizeForTesting = () => inFlight.size;

export const coalescedSubjectRead = async ({
	key,
	l1TtlMs,
	singleflight,
	fetch,
}: {
	key: string;
	l1TtlMs: number;
	singleflight: boolean;
	fetch: () => Promise<FullSubject>;
}): Promise<FullSubject> => {
	const cacheEnabled = l1TtlMs > 0;
	// Both controls off — byte-identical passthrough.
	if (!(singleflight || cacheEnabled)) return fetch();

	if (cacheEnabled) {
		const cached = subjectReadL1.get(key);
		if (cached) return cached;
	}

	if (singleflight) {
		const existing = inFlight.get(key);
		if (existing) return existing;
	}

	const flight = (async () => {
		const fullSubject = await fetch();
		if (cacheEnabled && isCacheableSize(fullSubject)) {
			subjectReadL1.set(key, fullSubject, { ttl: l1TtlMs });
		}
		return fullSubject;
	})();

	if (singleflight) {
		inFlight.set(key, flight);
		// Cleanup attaches after set() so a synchronously-rejecting fetch can't
		// delete first and leave a permanently poisoned in-flight entry.
		const cleanup = () => inFlight.delete(key);
		void flight.then(cleanup, cleanup);
	}
	return flight;
};
