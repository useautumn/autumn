import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../common/primitives.js";

/** A change that adds to a row's counters instead of replacing them, so it composes with every other writer of the row. `guard` names shape columns the row must still hold, such as a window's bounds. */
export type RowIncrement<Table extends string, Row, Add, Entries> = {
	table: Table;
	op: "increment";
	id: string;
	add: Add;
	addEntries?: Entries;
	guard?: Partial<Row>;
};

/** The loosest increment an applier handles: any counters, any map entries. */
export type AnyRowIncrement<Row> = RowIncrement<
	string,
	Row,
	Record<string, number | undefined>,
	Record<string, Record<string, Record<string, number | undefined>> | undefined>
>;

const balanceCounters = z
	.object({
		balance: finiteNumberSchema,
		adjustment: finiteNumberSchema,
		additional_balance: finiteNumberSchema,
	})
	.partial()
	.strict();

const attributionCounters = z
	.object({ units: finiteNumberSchema, credits: finiteNumberSchema })
	.partial()
	.strict();

const rolloverCounters = z
	.object({ balance: finiteNumberSchema, usage: finiteNumberSchema })
	.partial()
	.strict();

/** Which columns each balance table adds to, and which map columns hold counter entries. */
export const customerEntitlementIncrementParts = {
	add: balanceCounters,
	entries: z
		.object({
			entities: z.record(z.string(), balanceCounters),
			usage_attribution: z.record(z.string(), attributionCounters),
		})
		.partial()
		.strict(),
};

export const rolloverIncrementParts = {
	add: rolloverCounters,
	entries: z
		.object({ entities: z.record(z.string(), rolloverCounters) })
		.partial()
		.strict(),
};

export const usageWindowIncrementParts = {
	add: z.object({ usage: finiteNumberSchema }).partial().strict(),
	entries: z.object({}).strict(),
};

export const rowIncrementSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
	Add extends z.ZodObject,
	Entries extends z.ZodObject,
>({
	table,
	rowSchema,
	parts,
}: {
	table: Table;
	rowSchema: RowSchema;
	parts: { add: Add; entries: Entries };
}) =>
	z
		.object({
			table: z.literal(table),
			op: z.literal("increment"),
			id: nonEmptyStringSchema,
			add: parts.add,
			addEntries: parts.entries.optional(),
			guard: rowSchema.partial().optional(),
		})
		.strict();

/** What a map entry looks like before anything was added to it: its counters at zero, and for an entity its key as `id`. */
export const entrySeedOf = ({
	table,
	column,
	key,
}: {
	table: string;
	column: string;
	key: string;
}): Record<string, unknown> => {
	if (column === "usage_attribution") return { units: 0, credits: 0 };
	if (column !== "entities") return {};
	return table === "rollovers"
		? { id: key, balance: 0, usage: 0 }
		: { id: key, balance: 0, adjustment: 0 };
};

/** Attribution entries that net to zero leave the map, as the Lua path drops them; an entity at zero still exists. */
export const prunesAtZero = ({ column }: { column: string }): boolean =>
	column === "usage_attribution";
