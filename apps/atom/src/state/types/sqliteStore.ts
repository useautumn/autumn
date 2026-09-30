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
	close(): void;
};
