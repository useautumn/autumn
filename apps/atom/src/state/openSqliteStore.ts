import { pushPhaseMs } from "../pushes/pushPhaseMs.js";
import { deepFreeze } from "./deepFreeze.js";
import { getHeldSubjects } from "./heldSubjects/getHeldSubjects.js";
import { openSlotDatabase } from "./openSlotDatabase.js";
import {
	countSubjects,
	readSubjectRow,
	type SubjectWrite,
	storedSubjectFromRow,
	subjectToSlice,
	upsertSubjects,
} from "./repos/subjectStates.js";
import type { SqliteStore } from "./types/sqliteStore.js";
import type { StoredSubject } from "./types/storedSubject.js";

/** Every slot's subject reads on this thread, and how many read the file: published as the held copies' hit rate. */
export const subjectReadCounts = { reads: 0, parses: 0 };

/** Tells this thread's stores apart in the one held-subjects budget, files and in-memory stores alike. */
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
}: {
	databasePath: string;
}): SqliteStore => {
	const ctx = { sqliteDb: openSlotDatabase({ databasePath }) };
	const held = getHeldSubjects();
	const storePrefix = `${storesOpened++}\u0000`;

	function readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null {
		subjectReadCounts.reads += 1;
		const key = storePrefix + subjectKey(params);
		const found = held.get(key);
		if (found) return found.subject;
		const row = readSubjectRow({ ctx, ...params });
		if (row === null) return null;
		subjectReadCounts.parses += 1;
		const { subject, bytes, sliceHash } = storedSubjectFromRow({ row });
		// Frozen, because every check of the subject shares the copy.
		held.hold({ key, subject: deepFreeze(subject), bytes, sliceHash });
		return subject;
	}

	/** A slice the held copy already has is stored as it is: its row stays, and its frozen catalog and org are reused. */
	function writeOf(subject: StoredSubject): SubjectWrite {
		const slice = subjectToSlice({ subject });
		const heldCopy = held.get(storePrefix + keyOf(subject));
		if (heldCopy?.sliceHash !== slice.hash)
			return { subject, slice, sliceStored: false };
		const { catalog, org } = heldCopy.subject;
		return { subject: { ...subject, catalog, org }, slice, sliceStored: true };
	}

	/** After the commit, and only the subjects it stored: one it ignored as older leaves the newer copy held. */
	function setSubjects({ subjects }: { subjects: StoredSubject[] }): boolean[] {
		const writeStartedAt = performance.now();
		const writes = subjects.map(writeOf);
		const storedBytes = upsertSubjects({ ctx, writes });
		writes.forEach(({ subject, slice }, index) => {
			const bytes = storedBytes[index];
			if (bytes === null || bytes === undefined) return;
			held.hold({
				key: storePrefix + keyOf(subject),
				subject: deepFreeze(subject),
				bytes,
				sliceHash: slice.hash,
			});
		});
		pushPhaseMs.write += performance.now() - writeStartedAt;
		return storedBytes.map((bytes) => bytes !== null);
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
