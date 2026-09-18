import {
	type SubjectRowChange,
	subjectRowIdOf,
} from "../../types/subjectRowChange.js";
import type { SubjectRowUpdate } from "../../types/subjectRowUpdate.js";

const isNumber = (value: unknown): value is number => typeof value === "number";

/** Counters added onto a map value held in `set`: the entry is rebuilt in code the way SQL would rebuild the stored one. */
const addEntriesToValue = ({
	value,
	entries,
}: {
	value: unknown;
	entries: Record<string, Record<string, number>>;
}): Record<string, unknown> => {
	const map: Record<string, unknown> =
		value && typeof value === "object" ? { ...(value as object) } : {};
	for (const [key, fields] of Object.entries(entries)) {
		const stored = map[key];
		const entry: Record<string, unknown> =
			stored && typeof stored === "object"
				? { ...(stored as object) }
				: { id: key };
		for (const [field, delta] of Object.entries(fields)) {
			const current = entry[field];
			entry[field] = (isNumber(current) ? current : 0) + delta;
		}
		map[key] = entry;
	}
	return map;
};

/** Later changes land on top of earlier ones: a set replaces what an add moved, an add after a set moves the set value. */
const foldInto = ({
	folded,
	next,
}: {
	folded: SubjectRowUpdate;
	next: SubjectRowUpdate;
}): void => {
	for (const [column, value] of Object.entries(next.set)) {
		folded.set[column] = value;
		delete folded.add[column];
		delete folded.addEntries[column];
	}
	for (const [column, delta] of Object.entries(next.add)) {
		const setValue = folded.set[column];
		if (isNumber(setValue)) folded.set[column] = setValue + delta;
		else folded.add[column] = (folded.add[column] ?? 0) + delta;
	}
	for (const [column, entries] of Object.entries(next.addEntries)) {
		if (column in folded.set) {
			folded.set[column] = addEntriesToValue({
				value: folded.set[column],
				entries,
			});
			continue;
		}
		const byKey = folded.addEntries[column] ?? {};
		folded.addEntries[column] = byKey;
		for (const [key, fields] of Object.entries(entries)) {
			const target = byKey[key] ?? {};
			byKey[key] = target;
			for (const [field, delta] of Object.entries(fields)) {
				target[field] = (target[field] ?? 0) + delta;
			}
		}
	}
};

/** An update landing on a row this flush inserts: the inserted row is rewritten in code instead. */
const applyUpdateToRow = ({
	row,
	update,
}: {
	row: Record<string, unknown>;
	update: SubjectRowUpdate;
}): Record<string, unknown> => {
	const next = { ...row, ...update.set };
	for (const [column, delta] of Object.entries(update.add)) {
		const current = next[column];
		next[column] = (isNumber(current) ? current : 0) + delta;
	}
	for (const [column, entries] of Object.entries(update.addEntries)) {
		next[column] = addEntriesToValue({ value: next[column], entries });
	}
	return next;
};

export class SubjectRowChangeOrderError extends Error {
	constructor({
		table,
		id,
		sequence,
	}: { table: string; id: string; sequence: string }) {
		super(`Row ${table}:${id} cannot be ${sequence} in one flush`);
		this.name = "SubjectRowChangeOrderError";
	}
}

/** The folded change after one more lands on the same row; null when the pair cancels out (insert then delete). */
const foldChange = ({
	folded,
	next,
}: {
	folded: SubjectRowChange;
	next: SubjectRowChange;
}): SubjectRowChange | null => {
	const { table } = folded;
	const id = subjectRowIdOf(folded);
	if (next.op === "insert") {
		// A row removed and re-created in one flush is one replacement of every column.
		if (folded.op === "delete") {
			return {
				op: "update",
				table,
				id,
				set: { ...next.row },
				add: {},
				addEntries: {},
				guard: {},
			};
		}
		throw new SubjectRowChangeOrderError({
			table,
			id,
			sequence: "inserted twice",
		});
	}
	if (next.op === "delete") {
		if (folded.op === "insert") return null;
		if (folded.op === "delete") {
			throw new SubjectRowChangeOrderError({
				table,
				id,
				sequence: "deleted twice",
			});
		}
		return { op: "delete", table, id };
	}
	if (folded.op === "delete") {
		throw new SubjectRowChangeOrderError({
			table,
			id,
			sequence: "updated after delete",
		});
	}
	if (folded.op === "insert") {
		return {
			...folded,
			row: applyUpdateToRow({ row: folded.row, update: next }),
		};
	}
	foldInto({ folded, next });
	return folded;
};

/**
 * One change per row, in first-seen order. A statement may not touch a row twice, and a hot row's
 * many moves become one write. An update's guard stays the first change's: what the row held when the chain began.
 * `foldedIndexOf[i]` is null when change i cancelled out (an insert this flush later deleted).
 */
export const foldSubjectRowChanges = ({
	changes,
}: {
	changes: readonly SubjectRowChange[];
}): { folded: SubjectRowChange[]; foldedIndexOf: (number | null)[] } => {
	const slots: (SubjectRowChange | null)[] = [];
	const slotOf: number[] = [];
	const slotByRow = new Map<string, number>();
	for (const change of changes) {
		const key = `${change.table}:${subjectRowIdOf(change)}`;
		const slot = slotByRow.get(key);
		const current = slot === undefined ? undefined : slots[slot];
		if (slot === undefined || current === undefined || current === null) {
			const fresh = change.op === "update" ? copyUpdate(change) : { ...change };
			slotByRow.set(key, slots.length);
			slotOf.push(slots.length);
			slots.push(fresh);
			continue;
		}
		slots[slot] = foldChange({ folded: current, next: change });
		slotOf.push(slot);
	}
	// Cancelled slots vanish; every index is remapped to the surviving position, or null.
	const position = new Map<number, number>();
	const folded: SubjectRowChange[] = [];
	for (const [slot, change] of slots.entries()) {
		if (change === null) continue;
		position.set(slot, folded.length);
		folded.push(change);
	}
	return {
		folded,
		foldedIndexOf: slotOf.map((slot) => position.get(slot) ?? null),
	};
};

const copyUpdate = (
	update: SubjectRowUpdate & { op: "update" },
): SubjectRowChange => ({
	op: "update",
	table: update.table,
	id: update.id,
	set: { ...update.set },
	add: { ...update.add },
	addEntries: Object.fromEntries(
		Object.entries(update.addEntries).map(([column, byKey]) => [
			column,
			Object.fromEntries(
				Object.entries(byKey).map(([key, fields]) => [key, { ...fields }]),
			),
		]),
	),
	guard: { ...update.guard },
});
