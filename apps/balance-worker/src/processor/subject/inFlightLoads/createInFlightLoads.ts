import type { SubjectRead } from "../types/subjectRead.js";
import type {
	InFlightLoad,
	InFlightLoads,
	InFlightRead,
} from "./types/inFlightLoad.js";

type Entry = { load: InFlightLoad; promise: Promise<InFlightRead> };
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
	start: (params: { load: InFlightLoad }) => Promise<SubjectRead>;
}): Promise<InFlightRead> => {
	const running = entries.get(subjectKey);
	if (running) return running.promise;

	const load: InFlightLoad = { customerKey, overtaken: false };
	const promise = start({ load })
		.then((read) => ({ read, load }))
		.finally(() => {
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

/** The subject reads still running against Postgres, so an evict can reach rows that are not resident yet. */
export const createInFlightLoads = (): InFlightLoads => {
	const entries: Entries = new Map();
	return {
		join: (params) => join({ entries, ...params }),
		inFlight: ({ subjectKey }) => entries.get(subjectKey)?.promise ?? null,
		overtakeCustomer: ({ customerKey }) =>
			overtakeCustomer({ entries, customerKey }),
		count: () => entries.size,
	};
};
