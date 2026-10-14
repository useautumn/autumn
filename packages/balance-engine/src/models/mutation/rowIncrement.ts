import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../common/primitives.js";

export type RowIncrement<Table extends string, Row, Add, Entries> = {
	table: Table;
	op: "increment";
	id: string;
	add: Add;
	addEntries?: Entries;
	guard?: Partial<Row>;
};

export type AnyRowIncrement<Row> = RowIncrement<
	string,
	Row,
	Record<string, number | undefined>,
	Record<string, Record<string, Record<string, number | undefined>> | undefined>
>;

const anyCounters = finiteNumberSchema.optional();
const anyEntries = z
	.record(z.string(), z.record(z.string(), anyCounters))
	.optional();

const balanceCounters = z
	.object({
		balance: finiteNumberSchema,
		adjustment: finiteNumberSchema,
		additional_balance: finiteNumberSchema,
	})
	.partial()
	.catchall(anyCounters);

const attributionCounters = z
	.object({ units: finiteNumberSchema, credits: finiteNumberSchema })
	.partial()
	.catchall(anyCounters);

const rolloverCounters = z
	.object({ balance: finiteNumberSchema, usage: finiteNumberSchema })
	.partial()
	.catchall(anyCounters);

export const customerEntitlementIncrementParts = {
	add: balanceCounters,
	entries: z
		.object({
			entities: z.record(z.string(), balanceCounters),
			usage_attribution: z.record(z.string(), attributionCounters),
		})
		.partial()
		.catchall(anyEntries),
};

export const rolloverIncrementParts = {
	add: rolloverCounters,
	entries: z
		.object({ entities: z.record(z.string(), rolloverCounters) })
		.partial()
		.catchall(anyEntries),
};

export const pooledBalanceIncrementParts = {
	add: z
		.object({ granted: finiteNumberSchema })
		.partial()
		.catchall(anyCounters),
	entries: z.object({}).catchall(anyEntries),
};

export const usageWindowIncrementParts = {
	add: z.object({ usage: finiteNumberSchema }).partial().catchall(anyCounters),
	entries: z.object({}).catchall(anyEntries),
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
		.loose();

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

export const prunesAtZero = ({ column }: { column: string }): boolean =>
	column === "usage_attribution";
