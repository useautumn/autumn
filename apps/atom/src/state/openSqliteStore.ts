import { pushPhaseMs } from "../pushes/pushPhaseMs.js";
import { deepFreeze } from "./deepFreeze.js";
import { openSlotDatabase } from "./openSlotDatabase.js";
import {
	countSubjects,
	readSubject,
	readSubjectVersion,
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
	// A check parses its subject's row once per change to that row, not once per check: a push to one customer leaves the rest parsed.
	const parsed = new Map<string, { version: string; subject: StoredSubject }>();

	function readParsedSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null {
		subjectReadCounts.reads += 1;
		const version = readSubjectVersion({ ctx, ...params });
		if (version === null) return null;
		const key = subjectKey(params);
		const held = parsed.get(key);
		parsed.delete(key);
		if (held?.version === version) {
			parsed.set(key, held);
			return held.subject;
		}
		subjectReadCounts.parses += 1;
		const subject = readSubject({ ctx, ...params });
		if (subject === null) return null;
		if (parsed.size >= PARSED_SUBJECTS_PER_SLOT)
			parsed.delete(parsed.keys().next().value as string);
		// Versioned by what was read, not the version checked first: a write in between is caught by the next check.
		parsed.set(key, {
			version: `${subject.readAt}:${subject.logOffset}`,
			subject: deepFreeze(subject),
		});
		return subject;
	}

	return {
		readSubject: readParsedSubject,
		setSubject: (params) => upsertSubject({ ctx, ...params }),
		setSubjects: (params) => {
			const writeStartedAt = performance.now();
			const stored = upsertSubjects({ ctx, ...params });
			pushPhaseMs.write += performance.now() - writeStartedAt;
			return stored;
		},
		countSubjects: () => countSubjects({ ctx }),
		close: () => ctx.sqliteDb.close(true),
	};
};
