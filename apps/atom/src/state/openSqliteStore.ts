import { pushPhaseMs } from "../pushes/pushPhaseMs.js";
import { deepFreeze } from "./deepFreeze.js";
import { openSlotDatabase } from "./openSlotDatabase.js";
import { openVersionStamps } from "./openVersionStamps.js";
import {
	countSubjects,
	readSubjectRow,
	storedSubjectFromRow,
	subjectRowVersion,
	upsertSubject,
	upsertSubjects,
} from "./repos/subjectStates.js";
import type { SqliteStore } from "./types/sqliteStore.js";
import type { StoredSubject } from "./types/storedSubject.js";

/** Every slot's subject reads in this process, and how many parsed a row: published as the parsed copies' hit rate. */
export const subjectReadCounts = { reads: 0, parses: 0 };

/** Parsed subjects kept per slot, least recently read dropped first: bounds a process's memory however many customers it serves. */
const PARSED_SUBJECTS_PER_SLOT = 64;

const subjectKey = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string | null;
}): string => `${customerId}\u0000${entityId ?? ""}`;

export const openSqliteStore = ({
	databasePath,
}: {
	databasePath: string;
}): SqliteStore => {
	const ctx = { sqliteDb: openSlotDatabase({ databasePath }) };
	const stamps = openVersionStamps({
		path: databasePath === ":memory:" ? null : `${databasePath}-stamps`,
	});
	// A check parses its subject's row once per change to that row, not once per check: a push to one customer leaves the rest parsed.
	const parsed = new Map<
		string,
		{ version: string; stamp: number; subject: StoredSubject }
	>();

	function readParsedSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null {
		subjectReadCounts.reads += 1;
		const key = subjectKey(params);
		const stamp = stamps.read({ key });
		const held = parsed.get(key);
		// No write to the row's bucket since the copy was read: the copy is the row, without asking SQLite.
		if (held?.stamp === stamp) return held.subject;
		// One read of the row: the stamp moved, so it has most likely changed.
		const row = readSubjectRow({ ctx, ...params });
		if (row === null) return null;
		const version = subjectRowVersion({ row });
		parsed.delete(key);
		if (held?.version === version) {
			parsed.set(key, { ...held, stamp });
			return held.subject;
		}
		subjectReadCounts.parses += 1;
		const subject = deepFreeze(storedSubjectFromRow({ row }));
		if (parsed.size >= PARSED_SUBJECTS_PER_SLOT)
			parsed.delete(parsed.keys().next().value as string);
		parsed.set(key, { version, stamp, subject });
		return subject;
	}

	/** After the commit, never before: a reader that sees the old stamp is serving the row as it was before this write. */
	function bumpStamps({ subjects }: { subjects: StoredSubject[] }): void {
		for (const { state } of subjects)
			stamps.bump({
				key: subjectKey({
					customerId: state.identity.customerId,
					entityId: state.identity.entityId ?? null,
				}),
			});
	}

	return {
		readSubject: readParsedSubject,
		setSubject: (params) => {
			const stored = upsertSubject({ ctx, ...params });
			bumpStamps({ subjects: [params.subject] });
			return stored;
		},
		setSubjects: (params) => {
			const writeStartedAt = performance.now();
			const stored = upsertSubjects({ ctx, ...params });
			bumpStamps(params);
			pushPhaseMs.write += performance.now() - writeStartedAt;
			return stored;
		},
		countSubjects: () => countSubjects({ ctx }),
		close: () => ctx.sqliteDb.close(true),
	};
};
