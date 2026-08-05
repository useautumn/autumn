import type { FullSubject } from "@autumn/shared";

const inFlight = new Map<string, Promise<FullSubject>>();

export const _resetSubjectReadInFlightForTesting = () => {
	inFlight.clear();
};

export const _subjectReadInFlightSizeForTesting = () => inFlight.size;

/** Singleflight: concurrent reads of the same subject share one fetch.
 *  Nothing is cached — every caller arriving after settle fetches fresh. */
export const coalescedSubjectRead = async ({
	key,
	singleflight,
	fetch,
}: {
	key: string;
	singleflight: boolean;
	fetch: () => Promise<FullSubject>;
}): Promise<FullSubject> => {
	if (!singleflight) return fetch();

	const existing = inFlight.get(key);
	if (existing) return existing;

	const flight = fetch();
	inFlight.set(key, flight);
	// Cleanup attaches after set() so a synchronously-rejecting fetch can't
	// delete first and leave a permanently poisoned in-flight entry.
	const cleanup = () => inFlight.delete(key);
	void flight.then(cleanup, cleanup);
	return flight;
};
