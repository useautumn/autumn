import type { SubjectState } from "@autumn/balance-engine";

/** One Postgres read of a subject that has not become resident yet. */
export type InFlightLoad = {
	customerKey: string;
	/** An evict arrived while this was reading, so what it read may predate the write behind that evict. */
	overtaken: boolean;
};

export type InFlightLoads = {
	/** One load per subject: the first caller starts it, later callers get the same promise. */
	join(params: {
		subjectKey: string;
		customerKey: string;
		start: (params: { load: InFlightLoad }) => Promise<SubjectState>;
	}): Promise<SubjectState>;
	/** Flags every load of the customer still reading, its entities included. */
	overtakeCustomer(params: { customerKey: string }): void;
	count(): number;
};
