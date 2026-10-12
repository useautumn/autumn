import type { AppliedSubject, SubjectCursor } from "../repos/subjectStates.js";
import type { StoredSubject } from "./storedSubject.js";

/** One slot's file behind named methods: everything above the state layer talks to this, never to SQLite. */
export type SqliteStore = {
	/** `entityId` null reads the customer's own rows. */
	readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null;
	/** False when the subject was read before the one held, and so ignored. */
	setSubject(params: { subject: StoredSubject }): boolean;
	/** All in one write, so a reader never sees one without the others. One answer per subject, in order. */
	setSubjects(params: { subjects: StoredSubject[] }): boolean[];
	countSubjects(): number;
	/** Subjects this file wrote at or after `after` (null: all), oldest write first, from `cursor` on, at most `limit`. */
	listAppliedAfter(params: {
		after: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): AppliedSubject[];
	/** The newest write held by this replica's clock, 0 when empty. */
	maxAppliedAt(): number;
	close(): void;
};
