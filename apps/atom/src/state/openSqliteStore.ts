import { deepFreeze } from "./deepFreeze.js";
import type { HeldSubjects } from "./heldSubjects/types/heldSubjects.js";
import { openSlotDatabase } from "./openSlotDatabase.js";
import {
	countSubjects,
	dataBytes,
	deleteCustomersWrittenBefore,
	listDigestsAppliedAfter,
	listEntityIds,
	listSubjectsAppliedAfter,
	maxAppliedAt,
	readSubject as readSubjectRow,
	readSubjectsByKey,
	readSubjectVersion,
	type SubjectWrite,
	type SubjectWriteResult,
	subjectToSlice,
	upsertSubjects,
} from "./repos/subjectStates.js";
import type { SqliteStore } from "./types/sqliteStore.js";
import { isDeletedSubject, type SubjectRow } from "./types/storedSubject.js";

let storesOpened = 0;

const subjectKey = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string | null;
}): string => `${customerId}\u0000${entityId ?? ""}`;

const keyOf = ({ state }: SubjectRow): string =>
	subjectKey({
		customerId: state.identity.customerId,
		entityId: state.identity.entityId ?? null,
	});

export const openSqliteStore = ({
	databasePath,
	held,
	now = Date.now,
}: {
	databasePath: string;
	held: HeldSubjects;
	now?: () => number;
}): SqliteStore => {
	const ctx = { sqliteDb: openSlotDatabase({ databasePath }) };
	const storePrefix = `${storesOpened++}\u0000`;

	function readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): SubjectRow | null {
		const key = storePrefix + subjectKey(params);
		const found = held.get(key);
		if (found) return found.subject;
		const read = readSubjectRow({ ctx, ...params });
		if (read === null) return null;
		const subject = deepFreeze(read.subject);
		held.hold({ key, subject, bytes: read.bytes, sliceHash: read.sliceHash });
		return subject;
	}

	function readVersion(params: {
		customerId: string;
		entityId: string | null;
	}) {
		const found = held.get(storePrefix + subjectKey(params));
		if (found)
			return {
				readAt: found.subject.readAt,
				logOffset: found.subject.logOffset,
			};
		return readSubjectVersion({ ctx, ...params });
	}

	function writeOf(subject: SubjectRow): SubjectWrite {
		const slice = subjectToSlice({ subject });
		const heldCopy = held.get(storePrefix + keyOf(subject));
		if (
			heldCopy?.sliceHash !== slice.hash ||
			isDeletedSubject(subject) ||
			isDeletedSubject(heldCopy.subject)
		)
			return { subject, slice, sliceStored: false };
		const { catalog, org } = heldCopy.subject;
		return { subject: { ...subject, catalog, org }, slice, sliceStored: true };
	}

	function holdWritten({
		write: { subject, slice },
		result: { bytes, customerVersion },
	}: {
		write: SubjectWrite;
		result: SubjectWriteResult;
	}): void {
		const key = storePrefix + keyOf(subject);
		if (bytes !== null) {
			held.hold({
				key,
				subject: deepFreeze({
					...subject,
					customerVersion: customerVersion ?? subject.customerVersion,
				}),
				bytes,
				sliceHash: slice.hash,
			});
			return;
		}
		const heldCopy = held.get(key);
		if (
			customerVersion === null ||
			!heldCopy ||
			heldCopy.subject.customerVersion >= customerVersion
		)
			return;
		held.hold({
			key,
			subject: deepFreeze({ ...heldCopy.subject, customerVersion }),
			bytes: heldCopy.bytes,
			sliceHash: heldCopy.sliceHash,
		});
	}

	function setSubjects({ subjects }: { subjects: SubjectRow[] }): boolean[] {
		const writes = subjects.map(writeOf);
		const results = upsertSubjects({ ctx, writes, appliedAt: now() });
		writes.forEach((write, index) => {
			const result = results[index];
			if (result) holdWritten({ write, result });
		});
		return results.map(({ bytes }) => bytes !== null);
	}

	function dropCustomersWrittenBefore(params: {
		before: number;
		limit: number;
	}) {
		const dropped = deleteCustomersWrittenBefore({ ctx, ...params });
		for (const row of dropped)
			held.drop(
				storePrefix + subjectKey({ ...row, entityId: row.entityId || null }),
			);
		return {
			customers: new Set(dropped.map((row) => row.customerId)).size,
			rows: dropped.length,
		};
	}

	function close(): void {
		held.dropPrefix(storePrefix);
		ctx.sqliteDb.close(true);
	}

	return {
		readSubject,
		readVersion,
		entityIdsOf: ({ customerId }) => listEntityIds({ ctx, customerId }),
		setSubject: ({ subject }) =>
			setSubjects({ subjects: [subject] })[0] ?? false,
		setSubjects,
		countSubjects: () => countSubjects({ ctx }),
		listAppliedAfter: (params) => listSubjectsAppliedAfter({ ctx, ...params }),
		listDigestsAfter: (params) => listDigestsAppliedAfter({ ctx, ...params }),
		readByKey: (params) => readSubjectsByKey({ ctx, ...params }),
		maxAppliedAt: () => maxAppliedAt({ ctx }),
		dropCustomersWrittenBefore,
		dataBytes: () => dataBytes({ ctx }),
		close,
	};
};
