import { z } from "zod/v4";
import { nonEmptyStringSchema } from "./common/primitives.js";
import {
	type WorkerCustomerEntitlement,
	workerCustomerEntitlementSchema,
} from "./rows/workerCustomerEntitlement.js";
import {
	type WorkerCustomerProduct,
	workerCustomerProductSchema,
} from "./rows/workerCustomerProduct.js";
import { type WorkerEntity, workerEntitySchema } from "./rows/workerEntity.js";
import {
	type WorkerRollover,
	workerRolloverSchema,
} from "./rows/workerRollover.js";

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

/** One change to one row of the customer's state; a mutation applies a list of these in order. */
export type RowChange =
	| TableRowChange<"customerProducts", WorkerCustomerProduct>
	| TableRowChange<"customerEntitlements", WorkerCustomerEntitlement>
	| TableRowChange<"rollovers", WorkerRollover>
	| TableRowChange<"entities", WorkerEntity>;

export const rowChangeSchema = z.discriminatedUnion("table", [
	tableRowChangeSchema({
		table: "customerProducts",
		rowSchema: workerCustomerProductSchema,
	}),
	tableRowChangeSchema({
		table: "customerEntitlements",
		rowSchema: workerCustomerEntitlementSchema,
	}),
	tableRowChangeSchema({ table: "rollovers", rowSchema: workerRolloverSchema }),
	tableRowChangeSchema({ table: "entities", rowSchema: workerEntitySchema }),
]);
