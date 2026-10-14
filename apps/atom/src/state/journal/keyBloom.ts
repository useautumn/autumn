import { BloomFilter } from "bloomfilter";

/** Three windows cover the 90 min a key row is read for: a key stays in a filter 60 to 90 min after its append. */
export const BLOOM_WINDOW_MS = 30 * 60_000;
/** One thread's keys per window with headroom; past it the filter answers "maybe" more often, never wrongly. */
export const BLOOM_KEYS_PER_WINDOW = 1_000_000;
const WINDOWS = 3;
/** 9.6 bits a key and 7 hashes: about 1 % false positives at the designed count, 1.2 MB a filter. */
const BITS = Math.ceil(BLOOM_KEYS_PER_WINDOW * 9.6);
const HASHES = 7;

/** One set per thread, as keys carry their customer: module state is the thread's own. */
let filters: BloomFilter[] | null = null;
let newestWindow = 0;

const filterValueOf = ({
	customerId,
	keyHash,
}: {
	customerId: string;
	keyHash: Uint8Array;
}) => `${customerId}\u0000${String.fromCharCode(...keyHash)}`;

/** The filters as of `now`, each window that ended more than two windows ago emptied for reuse. */
const filtersAt = ({ now }: { now: number }): BloomFilter[] => {
	const window = Math.floor(now / BLOOM_WINDOW_MS);
	filters ??= Array.from(
		{ length: WINDOWS },
		() => new BloomFilter(BITS, HASHES),
	);
	if (window !== newestWindow) {
		const stale =
			window < newestWindow
				? WINDOWS
				: Math.min(window - newestWindow, WINDOWS);
		for (let step = 0; step < stale; step++)
			filters[(window - step) % WINDOWS]?.buckets.fill(0);
		newestWindow = window;
	}
	return filters;
};

/** The oldest append whose key the filters still hold as of `now`: the start of the oldest window. */
export const heldKeysSince = ({ now }: { now: number }): number =>
	(Math.floor(now / BLOOM_WINDOW_MS) - (WINDOWS - 1)) * BLOOM_WINDOW_MS;

/** Into the filter of the window `appendedAt` falls in; a key older than every window held is left out. */
export const addKey = ({
	customerId,
	keyHash,
	now,
	appendedAt = now,
}: {
	customerId: string;
	keyHash: Uint8Array;
	now: number;
	appendedAt?: number;
}): void => {
	const held = filtersAt({ now });
	if (appendedAt < heldKeysSince({ now })) return;
	const window = Math.floor(appendedAt / BLOOM_WINDOW_MS);
	held[window % WINDOWS]?.add(filterValueOf({ customerId, keyHash }));
};

/** False only for a key no append of the last 60 to 90 min took. */
export const mayHoldKey = ({
	customerId,
	keyHash,
	now,
}: {
	customerId: string;
	keyHash: Uint8Array;
	now: number;
}): boolean => {
	const value = filterValueOf({ customerId, keyHash });
	return filtersAt({ now }).some((filter) => filter.test(value));
};

/** The filters a thread starts with: empty, as after a restart. */
export const emptyKeyFilters = (): void => {
	filters = null;
	newestWindow = 0;
};
