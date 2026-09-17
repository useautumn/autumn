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
	type WorkerRollover,
	workerRolloverSchema,
} from "../subject/rows/workerRollover.js";
import {
	type WorkerUsageWindow,
	workerUsageWindowSchema,
} from "../subject/rows/workerUsageWindow.js";

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
const tableRowChangeSchema = <
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

	return z.discriminatedUnion("op", [
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
	]);
};

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

/** One change to one row of the subject's state; a mutation applies a list of these in order. */
export type RowChange =
	| SubjectRowChange<"customer", WorkerCustomer>
	| SubjectRowChange<"entity", WorkerEntity>
	| TableRowChange<"customerProducts", WorkerCustomerProduct>
	| TableRowChange<"customerPrices", WorkerCustomerPrice>
	| TableRowChange<"customerEntitlements", WorkerCustomerEntitlement>
	| TableRowChange<"rollovers", WorkerRollover>
	| TableRowChange<"usageWindows", WorkerUsageWindow>;

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
	tableRowChangeSchema({
		table: "customerEntitlements",
		rowSchema: workerCustomerEntitlementSchema,
	}),
	tableRowChangeSchema({ table: "rollovers", rowSchema: workerRolloverSchema }),
	tableRowChangeSchema({
		table: "usageWindows",
		rowSchema: workerUsageWindowSchema,
	}),
]);
