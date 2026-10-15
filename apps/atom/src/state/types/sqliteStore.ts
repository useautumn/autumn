import type {
	AppliedSubject,
	SubjectCursor,
	SubjectDigest,
} from "../repos/subjectStates.js";
import type { SubjectRow } from "./storedSubject.js";

/** One slot's file behind named methods: everything above the state layer talks to this, never to SQLite. */
export type SqliteStore = {
	/** `entityId` null reads the customer's own rows. */
	readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): SubjectRow | null;
	/** The version held for a subject, from the copy held or the row alone, parsing and holding nothing; null when absent. */
	readVersion(params: {
		customerId: string;
		entityId: string | null;
	}): { readAt: number; logOffset: bigint } | null;
	/** The entities of the customer the file holds rows for. */
	entityIdsOf(params: { customerId: string }): string[];
	/** False when the subject was read before the one held, and so ignored. Resolves once the write has committed. */
	setSubject(params: { subject: SubjectRow }): Promise<boolean>;
	/**
	 * All in one write, so a reader never sees one without the others. One answer per subject, in order, once committed;
	 * `onStored` gets them in the same turn the held copies change.
	 */
	setSubjects(params: {
		subjects: SubjectRow[];
		onStored?: (stored: boolean[]) => void;
	}): Promise<boolean[]>;
	countSubjects(): number;
	/** Subjects this file wrote at or after `after` (null: all), oldest write first, from `cursor` on, at most `limit`. */
	listAppliedAfter(params: {
		after: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): AppliedSubject[];
	/** The same pages as `listAppliedAfter`, as identities and versions only. */
	listDigestsAfter(params: {
		after: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): SubjectDigest[];
	/** The rows named; a key not held is left out. */
	readByKey(params: {
		keys: { customerId: string; entityId: string }[];
	}): AppliedSubject[];
	/** The newest write held by this replica's clock, 0 when empty. */
	maxAppliedAt(): number;
	/** Drops up to `limit` customers none of whose rows was written since `before`, oldest first, whole, held copies included. */
	dropCustomersWrittenBefore(params: {
		before: number;
		limit: number;
	}): Promise<{
		customers: number;
		rows: number;
	}>;
	/** The pages the file holds: what it takes on the volume once the main thread has checkpointed its log. */
	dataBytes(): number;
	close(): void;
};
