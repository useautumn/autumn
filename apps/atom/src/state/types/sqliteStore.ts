import type {
	AppliedSubject,
	SubjectCursor,
	SubjectDigest,
} from "../repos/subjectStates.js";
import type { SubjectRow } from "./storedSubject.js";

export type SqliteStore = {
	readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): SubjectRow | null;
	readVersion(params: {
		customerId: string;
		entityId: string | null;
	}): { readAt: number; logOffset: bigint } | null;
	entityIdsOf(params: { customerId: string }): string[];
	setSubject(params: { subject: SubjectRow }): boolean;
	setSubjects(params: { subjects: SubjectRow[] }): boolean[];
	countSubjects(): number;
	listAppliedAfter(params: {
		after: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): AppliedSubject[];
	listDigestsAfter(params: {
		after: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): SubjectDigest[];
	readByKey(params: {
		keys: { customerId: string; entityId: string }[];
	}): AppliedSubject[];
	maxAppliedAt(): number;
	dropCustomersWrittenBefore(params: { before: number; limit: number }): {
		customers: number;
		rows: number;
	};
	dataBytes(): number;
	close(): void;
};
