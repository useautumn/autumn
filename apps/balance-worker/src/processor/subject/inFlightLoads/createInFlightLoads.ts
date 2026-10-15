import type { SubjectRead } from "../types/subjectRead.js";
import type {
	InFlightLoad,
	InFlightLoads,
	InFlightRead,
} from "./types/inFlightLoad.js";

type Entry = { load: InFlightLoad; promise: Promise<InFlightRead> };
type Entries = Map<string, Entry>;
type CustomerCounts = Map<string, number>;

const join = ({
	entries,
	customerCounts,
	subjectKey,
	customerKey,
	start,
}: {
	entries: Entries;
	customerCounts: CustomerCounts;
	subjectKey: string;
	customerKey: string;
	start: (params: { load: InFlightLoad }) => Promise<SubjectRead>;
}): Promise<InFlightRead> => {
	const running = entries.get(subjectKey);
	if (running) return running.promise;

	const load: InFlightLoad = { customerKey, overtaken: false };
	customerCounts.set(customerKey, (customerCounts.get(customerKey) ?? 0) + 1);
	const promise = start({ load })
		.then((read) => ({ read, load }))
		.finally(() => {
			entries.delete(subjectKey);
			const remaining = (customerCounts.get(customerKey) ?? 1) - 1;
			if (remaining > 0) customerCounts.set(customerKey, remaining);
			else customerCounts.delete(customerKey);
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
	const customerCounts: CustomerCounts = new Map();
	return {
		join: (params) => join({ entries, customerCounts, ...params }),
		loadingCustomer: ({ customerKey }) => customerCounts.has(customerKey),
		inFlight: ({ subjectKey }) => entries.get(subjectKey)?.promise ?? null,
		overtakeCustomer: ({ customerKey }) =>
			overtakeCustomer({ entries, customerKey }),
		count: () => entries.size,
	};
};
