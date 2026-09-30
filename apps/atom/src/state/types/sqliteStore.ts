import type { StoredSubject } from "./storedSubject.js";

/** One slot's file behind named methods: everything above the state layer talks to this, never to SQLite. */
export type SqliteStore = {
	/** `entityId` null reads the customer's own rows. */
	readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null;
	setSubject(params: { subject: StoredSubject }): void;
	close(): void;
};
