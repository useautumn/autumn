import type { SubjectRowsEnvelope } from "./subjectRowsEnvelope.js";

/** One cold read of a subject: its snapshot row's state when one was asked for and exists, else its rows, else nothing. */
export type SubjectRowsRead = {
	/** The jsonb as stored; the caller parses it, and a row that will not parse falls through to `envelope` on the next read. */
	snapshot: unknown | null;
	/** Null when the customer, or the named entity of it, does not exist; also null when `snapshot` answered. */
	envelope: SubjectRowsEnvelope | null;
};
