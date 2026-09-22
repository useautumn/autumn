import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";
import {
	type WorkerCustomer,
	workerCustomerSchema,
} from "../subject/rows/workerCustomer.js";
import {
	type WorkerCustomerEntitlement,
	workerCustomerEntitlementSchema,
} from "../subject/rows/workerCustomerEntitlement.js";
import {
	type WorkerCustomerPrice,
	workerCustomerPriceSchema,
} from "../subject/rows/workerCustomerPrice.js";
import {
	type WorkerCustomerProduct,
	workerCustomerProductSchema,
} from "../subject/rows/workerCustomerProduct.js";
import {
	type WorkerEntity,
	workerEntitySchema,
} from "../subject/rows/workerEntity.js";
import {
	type WorkerLock,
	workerLockSchema,
} from "../subject/rows/workerLock.js";
import {
	type WorkerPooledBalance,
	workerPooledBalanceSchema,
} from "../subject/rows/workerPooledBalance.js";
import {
	type WorkerRollover,
	workerRolloverSchema,
} from "../subject/rows/workerRollover.js";
import {
	type WorkerUsageWindow,
	workerUsageWindowSchema,
} from "../subject/rows/workerUsageWindow.js";
import {
	customerEntitlementIncrementParts,
	type RowIncrement,
	rolloverIncrementParts,
	rowIncrementSchema,
	usageWindowIncrementParts,
} from "./rowIncrement.js";

export type TableRowChange<Table extends string, Row> =
	| { table: Table; op: "insert"; row: Row }
	| {
			table: Table;
			op: "update";
			id: string;
			before: Partial<Row>;
			after: Partial<Row>;
	  }
	| { table: Table; op: "delete"; id: string };

/** Row schemas carry no defaults, so a partial names exactly the columns a change touches. */
const tableRowChangeOptions = <
	Table extends string,
	RowSchema extends z.ZodObject,
>({
	table,
	rowSchema,
}: {
	table: Table;
	rowSchema: RowSchema;
}) => {
	const tableSchema = z.literal(table);

	return [
		z
			.object({ table: tableSchema, op: z.literal("insert"), row: rowSchema })
			.strict(),
		z
			.object({
				table: tableSchema,
				op: z.literal("update"),
				id: nonEmptyStringSchema,
				before: rowSchema.partial(),
				after: rowSchema.partial(),
			})
			.strict(),
		z
			.object({
				table: tableSchema,
				op: z.literal("delete"),
				id: nonEmptyStringSchema,
			})
			.strict(),
	] as const;
};

const tableRowChangeSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
>(params: {
	table: Table;
	rowSchema: RowSchema;
}) => z.discriminatedUnion("op", tableRowChangeOptions(params));

/** A balance table's rows also move by increment. */
const balanceRowChangeSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
	Add extends z.ZodObject,
	Entries extends z.ZodObject,
>(params: {
	table: Table;
	rowSchema: RowSchema;
	parts: { add: Add; entries: Entries };
}) =>
	z.discriminatedUnion("op", [
		...tableRowChangeOptions(params),
		rowIncrementSchema(params),
	]);

export type CustomerEntitlementIncrement = RowIncrement<
	"customerEntitlements",
	WorkerCustomerEntitlement,
	z.infer<typeof customerEntitlementIncrementParts.add>,
	z.infer<typeof customerEntitlementIncrementParts.entries>
>;
export type RolloverIncrement = RowIncrement<
	"rollovers",
	WorkerRollover,
	z.infer<typeof rolloverIncrementParts.add>,
	z.infer<typeof rolloverIncrementParts.entries>
>;
export type UsageWindowIncrement = RowIncrement<
	"usageWindows",
	WorkerUsageWindow,
	z.infer<typeof usageWindowIncrementParts.add>,
	z.infer<typeof usageWindowIncrementParts.entries>
>;

/** The subject's own row: inserted once by the initialize that names it, never updated by a mutation. */
export type SubjectRowChange<Table extends string, Row> = {
	table: Table;
	op: "insert";
	row: Row;
};

const subjectRowChangeSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
>({
	table,
	rowSchema,
}: {
	table: Table;
	rowSchema: RowSchema;
}) =>
	z
		.object({
			table: z.literal(table),
			op: z.literal("insert"),
			row: rowSchema,
		})
		.strict();

/** A table whose rows are written once and removed once, never edited: the general row change without its update. */
export type WriteOnceRowChange<Table extends string, Row> = Exclude<
	TableRowChange<Table, Row>,
	{ op: "update" }
>;

const writeOnceRowChangeSchema = <
	Table extends string,
	RowSchema extends z.ZodObject,
>(params: {
	table: Table;
	rowSchema: RowSchema;
}) => {
	const [insert, , remove] = tableRowChangeOptions(params);
	return z.discriminatedUnion("op", [insert, remove]);
};

/** Nothing edits a lock row, which is what lets finalize trust the copy it is handed. */
export type LockRowChange = WriteOnceRowChange<"locks", WorkerLock>;

/** One change to one row of the subject's state; a mutation applies a list of these in order. */
export type RowChange =
	| SubjectRowChange<"customer", WorkerCustomer>
	| SubjectRowChange<"entity", WorkerEntity>
	| TableRowChange<"customerProducts", WorkerCustomerProduct>
	| TableRowChange<"customerPrices", WorkerCustomerPrice>
	| TableRowChange<"customerEntitlements", WorkerCustomerEntitlement>
	| CustomerEntitlementIncrement
	| TableRowChange<"rollovers", WorkerRollover>
	| RolloverIncrement
	| TableRowChange<"usageWindows", WorkerUsageWindow>
	| UsageWindowIncrement
	| TableRowChange<"pooledBalances", WorkerPooledBalance>
	| LockRowChange;

export const rowChangeSchema = z.discriminatedUnion("table", [
	subjectRowChangeSchema({
		table: "customer",
		rowSchema: workerCustomerSchema,
	}),
	subjectRowChangeSchema({ table: "entity", rowSchema: workerEntitySchema }),
	tableRowChangeSchema({
		table: "customerProducts",
		rowSchema: workerCustomerProductSchema,
	}),
	tableRowChangeSchema({
		table: "customerPrices",
		rowSchema: workerCustomerPriceSchema,
	}),
	balanceRowChangeSchema({
		table: "customerEntitlements",
		rowSchema: workerCustomerEntitlementSchema,
		parts: customerEntitlementIncrementParts,
	}),
	balanceRowChangeSchema({
		table: "rollovers",
		rowSchema: workerRolloverSchema,
		parts: rolloverIncrementParts,
	}),
	balanceRowChangeSchema({
		table: "usageWindows",
		rowSchema: workerUsageWindowSchema,
		parts: usageWindowIncrementParts,
	}),
	tableRowChangeSchema({
		table: "pooledBalances",
		rowSchema: workerPooledBalanceSchema,
	}),
	writeOnceRowChangeSchema({ table: "locks", rowSchema: workerLockSchema }),
]);
