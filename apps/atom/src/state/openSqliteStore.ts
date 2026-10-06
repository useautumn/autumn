import { openSlotDatabase } from "./openSlotDatabase.js";
import {
	countSubjects,
	readSlotDataVersion,
	readSubject,
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

/** Frozen, because every later check shares the same copy: a mutation throws instead of changing another check's answer. */
const deepFreeze = <T>(value: T): T => {
	if (typeof value !== "object" || value === null || Object.isFrozen(value))
		return value;
	Object.freeze(value);
	for (const child of Object.values(value)) deepFreeze(child);
	return value;
};

export const openSqliteStore = ({
	databasePath,
}: {
	databasePath: string;
}): SqliteStore => {
	const ctx = { sqliteDb: openSlotDatabase({ databasePath }) };
	// A check parses its subject's JSON once per change to the file, not once per check.
	const parsed = new Map<string, StoredSubject | null>();
	let parsedAtVersion = readSlotDataVersion({ ctx });

	function readParsedSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null {
		const version = readSlotDataVersion({ ctx });
		if (version !== parsedAtVersion) {
			parsed.clear();
			parsedAtVersion = version;
		}
		subjectReadCounts.reads += 1;
		const key = subjectKey(params);
		const held = parsed.get(key);
		if (held !== undefined) {
			parsed.delete(key);
			parsed.set(key, held);
			return held;
		}
		subjectReadCounts.parses += 1;
		const read = readSubject({ ctx, ...params });
		if (read === null) return null;
		if (parsed.size >= PARSED_SUBJECTS_PER_SLOT)
			parsed.delete(parsed.keys().next().value as string);
		parsed.set(key, deepFreeze(read));
		return read;
	}

	return {
		readSubject: readParsedSubject,
		// This connection's own writes do not move the data version, so they drop the parsed copies themselves.
		setSubject: (params) => {
			parsed.clear();
			return upsertSubject({ ctx, ...params });
		},
		setSubjects: (params) => {
			parsed.clear();
			return upsertSubjects({ ctx, ...params });
		},
		countSubjects: () => countSubjects({ ctx }),
		close: () => ctx.sqliteDb.close(true),
	};
};
