import type { SubjectState } from "@autumn/balance-engine";
import type { InFlightLoad, InFlightLoads } from "./types/inFlightLoad.js";

type Entry = { load: InFlightLoad; promise: Promise<SubjectState> };
type Entries = Map<string, Entry>;

const join = ({
	entries,
	subjectKey,
	customerKey,
	start,
}: {
	entries: Entries;
	subjectKey: string;
	customerKey: string;
	start: (params: { load: InFlightLoad }) => Promise<SubjectState>;
}): Promise<SubjectState> => {
	const running = entries.get(subjectKey);
	if (running) return running.promise;

	const load: InFlightLoad = { customerKey, overtaken: false };
	const promise = start({ load }).finally(() => {
		entries.delete(subjectKey);
	});
	entries.set(subjectKey, { load, promise });
	return promise;
};

const overtakeCustomer = ({
	entries,
	customerKey,
}: {
	entries: Entries;
	customerKey: string;
}): void => {
	for (const { load } of entries.values()) {
		if (load.customerKey === customerKey) load.overtaken = true;
	}
};

/** The subject loads still reading from Postgres, so an evict can reach rows that are not resident yet. */
export const createInFlightLoads = (): InFlightLoads => {
	const entries: Entries = new Map();
	return {
		join: (params) => join({ entries, ...params }),
		overtakeCustomer: ({ customerKey }) =>
			overtakeCustomer({ entries, customerKey }),
		count: () => entries.size,
	};
};
