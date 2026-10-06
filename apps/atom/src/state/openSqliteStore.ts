import { pushPhaseMs } from "../pushes/pushPhaseMs.js";
import { deepFreeze } from "./deepFreeze.js";
import { openSlotDatabase } from "./openSlotDatabase.js";
import {
	countSubjects,
	readSubjectRow,
	storedSubjectFromRow,
	upsertSubjects,
} from "./repos/subjectStates.js";
import type { SqliteStore } from "./types/sqliteStore.js";
import type { StoredSubject } from "./types/storedSubject.js";

/** Every slot's subject reads on this thread, and how many read the file: published as the held copies' hit rate. */
export const subjectReadCounts = { reads: 0, parses: 0 };

/** Subjects held per slot, the least recently read dropped first: a thread owning ~18 of 128 slots holds ~37k at most. */
const HELD_SUBJECTS_PER_SLOT = 2048;

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
	// Frozen, because every check of the subject shares the copy.
	const held = new Map<string, StoredSubject>();

	function readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null {
		subjectReadCounts.reads += 1;
		const key = subjectKey(params);
		const found = held.get(key);
		if (found) {
			held.delete(key);
			held.set(key, found);
			return found;
		}
		const row = readSubjectRow({ ctx, ...params });
		if (row === null) return null;
		subjectReadCounts.parses += 1;
		const subject = deepFreeze(storedSubjectFromRow({ ctx, row }));
		hold({ key, subject });
		return subject;
	}

	function hold({ key, subject }: { key: string; subject: StoredSubject }) {
		held.delete(key);
		if (held.size >= HELD_SUBJECTS_PER_SLOT)
			held.delete(held.keys().next().value as string);
		held.set(key, subject);
	}

	/** After the commit, and only the subjects it stored: one it ignored as older leaves the newer copy held. */
	function setSubjects({ subjects }: { subjects: StoredSubject[] }): boolean[] {
		const writeStartedAt = performance.now();
		const stored = upsertSubjects({ ctx, subjects });
		for (const subject of stored)
			if (subject) hold({ key: keyOf(subject), subject: deepFreeze(subject) });
		pushPhaseMs.write += performance.now() - writeStartedAt;
		return stored.map((subject) => subject !== null);
	}

	return {
		readSubject,
		setSubject: ({ subject }) =>
			setSubjects({ subjects: [subject] })[0] ?? false,
		setSubjects,
		countSubjects: () => countSubjects({ ctx }),
		close: () => ctx.sqliteDb.close(true),
	};
};
