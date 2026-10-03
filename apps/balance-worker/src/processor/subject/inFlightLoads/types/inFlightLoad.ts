import type { SubjectRead } from "../../types/subjectRead.js";

/** One Postgres read of a subject, shared by every caller that asked for it while it ran. */
export type InFlightLoad = {
	customerKey: string;
	/** An evict arrived while this was reading, so what it read may predate the write behind that evict. */
	overtaken: boolean;
};

/** What a shared read resolves to: the rows, and the load they came from, whose `overtaken` the caller checks before keeping them. */
export type InFlightRead = {
	read: SubjectRead;
	load: InFlightLoad;
};

export type InFlightLoads = {
	/** One read per subject: the first caller starts it, later callers get the same promise. Nothing becomes resident here. */
	join(params: {
		subjectKey: string;
		customerKey: string;
		start: (params: { load: InFlightLoad }) => Promise<SubjectRead>;
	}): Promise<InFlightRead>;
	/** The read of the subject still running, or null. */
	inFlight(params: { subjectKey: string }): Promise<InFlightRead> | null;
	/** Flags every load of the customer still reading, its entities included. */
	overtakeCustomer(params: { customerKey: string }): void;
	count(): number;
};
