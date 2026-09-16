import { z } from "zod/v4";
import { nonEmptyStringSchema } from "./common/primitives.js";
import {
	type LeanCustomerEntitlement,
	leanCustomerEntitlementSchema,
} from "./rows/leanCustomerEntitlement.js";

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

export const tableRowChangeSchema = <
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

export type RowChange = TableRowChange<
	"customerEntitlements",
	LeanCustomerEntitlement
>;

export const rowChangeSchema = z.discriminatedUnion("table", [
	tableRowChangeSchema({
		table: "customerEntitlements",
		rowSchema: leanCustomerEntitlementSchema,
	}),
]);
