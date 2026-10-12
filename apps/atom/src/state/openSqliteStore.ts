import { deepFreeze } from "./deepFreeze.js";
import type { HeldSubjects } from "./heldSubjects/types/heldSubjects.js";
import { openSlotDatabase } from "./openSlotDatabase.js";
import {
	countSubjects,
	readSubject as readSubjectRow,
	type SubjectWrite,
	type SubjectWriteResult,
	subjectToSlice,
	upsertSubjects,
} from "./repos/subjectStates.js";
import type { SqliteStore } from "./types/sqliteStore.js";
import type { StoredSubject } from "./types/storedSubject.js";

/** Tells this thread's stores apart in the one held-subjects budget. */
let storesOpened = 0;

const subjectKey = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string | null;
}): string => `${customerId}\u0000${entityId ?? ""}`;

const keyOf = ({ state }: StoredSubject): string =>
	subjectKey({
		customerId: state.identity.customerId,
		entityId: state.identity.entityId ?? null,
	});

/**
 * One slot's file and the subjects held from it. Only the slot's owner thread opens the file, so what it holds is
 * the file: a subject is parsed once, on its first read or as it is written, and served from memory after.
 */
export const openSqliteStore = ({
	databasePath,
	held,
}: {
	databasePath: string;
	held: HeldSubjects;
}): SqliteStore => {
	const ctx = { sqliteDb: openSlotDatabase({ databasePath }) };
	const storePrefix = `${storesOpened++}\u0000`;

	function readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null {
		const key = storePrefix + subjectKey(params);
		const found = held.get(key);
		if (found) return found.subject;
		const read = readSubjectRow({ ctx, ...params });
		if (read === null) return null;
		// Frozen, because every check of the subject shares the copy.
		const subject = deepFreeze(read.subject);
		held.hold({ key, subject, bytes: read.bytes, sliceHash: read.sliceHash });
		return subject;
	}

	/** A slice the held copy already has is kept as it is: its row stays, and its frozen catalog and org are reused. */
	function writeOf(subject: StoredSubject): SubjectWrite {
		const slice = subjectToSlice({ subject });
		const heldCopy = held.get(storePrefix + keyOf(subject));
		if (heldCopy?.sliceHash !== slice.hash)
			return { subject, slice, sliceStored: false };
		const { catalog, org } = heldCopy.subject;
		return { subject: { ...subject, catalog, org }, slice, sliceStored: true };
	}

	/** A stored subject is held as written; one ignored as older keeps the newer copy, carrying a version the push raised. */
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

	/** After the commit: only the store decides which part settles a customer's version, and rows still mean "stored". */
	function setSubjects({ subjects }: { subjects: StoredSubject[] }): boolean[] {
		const writes = subjects.map(writeOf);
		const results = upsertSubjects({ ctx, writes });
		writes.forEach((write, index) => {
			const result = results[index];
			if (result) holdWritten({ write, result });
		});
		return results.map(({ bytes }) => bytes !== null);
	}

	function close(): void {
		held.dropPrefix(storePrefix);
		ctx.sqliteDb.close(true);
	}

	return {
		readSubject,
		setSubject: ({ subject }) =>
			setSubjects({ subjects: [subject] })[0] ?? false,
		setSubjects,
		countSubjects: () => countSubjects({ ctx }),
		close,
	};
};
