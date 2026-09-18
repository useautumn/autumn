import { Decimal } from "decimal.js";
import {
	type AnyRowIncrement,
	entrySeedOf,
	prunesAtZero,
} from "../models/mutation/rowIncrement.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const plus = ({
	current,
	delta,
}: {
	current: unknown;
	delta: number;
}): number =>
	new Decimal(typeof current === "number" ? current : 0).plus(delta).toNumber();

/** One map entry with its counters moved; null when the column prunes and every counter reached zero. */
const incrementEntry = ({
	table,
	column,
	key,
	entry,
	fields,
	direction,
}: {
	table: string;
	column: string;
	key: string;
	entry: unknown;
	fields: Record<string, number | undefined>;
	direction: 1 | -1;
}): Record<string, unknown> | null => {
	const next: Record<string, unknown> = {
		...(isRecord(entry) ? entry : entrySeedOf({ table, column, key })),
	};
	for (const [field, delta] of Object.entries(fields)) {
		if (delta === undefined) continue;
		next[field] = plus({ current: next[field], delta: delta * direction });
	}
	const zeroed =
		prunesAtZero({ column }) &&
		Object.keys(fields).every((field) => next[field] === 0);
	return zeroed ? null : next;
};

/** The row with the increment's counters added (or, reverting, taken back). Adds never need the row's current values, so they compose with any writer. */
export const incrementRow = <Row extends object>({
	row,
	change,
	direction = 1,
}: {
	row: Row;
	change: AnyRowIncrement<Row>;
	direction?: 1 | -1;
}): Row => {
	const next: Row = { ...row };
	for (const [column, delta] of Object.entries(change.add)) {
		if (delta === undefined) continue;
		Reflect.set(
			next,
			column,
			plus({ current: Reflect.get(next, column), delta: delta * direction }),
		);
	}
	for (const [column, entries] of Object.entries(change.addEntries ?? {})) {
		if (!entries) continue;
		const current: unknown = Reflect.get(next, column);
		const map: Record<string, unknown> = {
			...(isRecord(current) ? current : {}),
		};
		for (const [key, fields] of Object.entries(entries)) {
			const entry = incrementEntry({
				table: change.table,
				column,
				key,
				entry: map[key],
				fields,
				direction,
			});
			if (entry === null) delete map[key];
			else map[key] = entry;
		}
		Reflect.set(next, column, map);
	}
	return next;
};
