import { deepFreeze } from "./deepFreeze.js";
import type { HeldSubjects } from "./heldSubjects/types/heldSubjects.js";
import {
	getNativeSubjects,
	nativeSubjectKey,
	type SubjectTexts,
} from "./nativeSubjects/nativeSubjects.js";
import { openSlotDatabase } from "./openSlotDatabase.js";
import {
	countSubjects,
	dataBytes,
	deleteCustomersWrittenBefore,
	listDigestsAppliedAfter,
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
	now = Date.now,
}: {
	databasePath: string;
	held: HeldSubjects;
	/** This replica's clock, stamped on every write so a peer can ask for what was written since. */
	now?: () => number;
}): SqliteStore => {
	const ctx = { sqliteDb: openSlotDatabase({ databasePath }) };
	const storePrefix = `${storesOpened++}\u0000`;
	const native = getNativeSubjects();

	const nativeKeyOf = (params: {
		customerId: string;
		entityId: string | null;
	}) => nativeSubjectKey({ databasePath, ...params });

	/** With the shared store on, every held copy is also in it, so other threads answer checks without asking this one. */
	function publish({
		subject,
		texts,
	}: {
		subject: StoredSubject;
		texts: SubjectTexts;
	}): (() => void) | undefined {
		if (!native) return undefined;
		const key = nativeKeyOf({
			customerId: subject.state.identity.customerId,
			entityId: subject.state.identity.entityId ?? null,
		});
		native.put({ key, subject, texts });
		return () => native.drop({ key });
	}

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
		held.hold({
			key,
			subject,
			bytes: read.bytes,
			sliceHash: read.sliceHash,
			release: publish({ subject, texts: read.texts }),
		});
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
		result: { bytes, customerVersion, stateJson },
	}: {
		write: SubjectWrite;
		result: SubjectWriteResult;
	}): void {
		const key = storePrefix + keyOf(subject);
		if (bytes !== null) {
			const stored = deepFreeze({
				...subject,
				customerVersion: customerVersion ?? subject.customerVersion,
			});
			held.hold({
				key,
				subject: stored,
				bytes,
				sliceHash: slice.hash,
				release: publish({
					subject: stored,
					texts: {
						stateJson,
						catalogJson: slice.catalogJson,
						orgJson: slice.orgJson,
					},
				}),
			});
			return;
		}
		// Set whether or not this thread holds a copy: one a restarted thread never held may still be shared.
		if (customerVersion !== null)
			native?.setCustomerVersion({
				key: nativeKeyOf({
					customerId: subject.state.identity.customerId,
					entityId: subject.state.identity.entityId ?? null,
				}),
				customerVersion,
			});
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
			release: heldCopy.release,
		});
	}

	/** After the commit: only the store decides which part settles a customer's version, and rows still mean "stored". */
	function setSubjects({ subjects }: { subjects: StoredSubject[] }): boolean[] {
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
		for (const row of dropped) {
			const key = { ...row, entityId: row.entityId || null };
			held.drop(storePrefix + subjectKey(key));
			native?.drop({ key: nativeKeyOf(key) });
		}
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
