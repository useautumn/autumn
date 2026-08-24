import { schemas } from "@autumn/shared";
import { z } from "zod/v4";
import { pgTableToRowSchema } from "../rows/pgTableToRowSchema.js";

const customerEntitlementRow = pgTableToRowSchema(schemas.customerEntitlements);

// `set` carries absolute values — `balance: 95`, never `-5` — so applying an
// entry twice is harmless.
const CustomerEntitlementChangeSchema = z.discriminatedUnion("op", [
	z.object({
		table: z.literal("customer_entitlements"),
		op: z.literal("insert"),
		id: z.string().min(1),
		row: customerEntitlementRow,
	}),
	z.object({
		table: z.literal("customer_entitlements"),
		op: z.literal("update"),
		id: z.string().min(1),
		set: customerEntitlementRow.partial(),
	}),
	z.object({
		table: z.literal("customer_entitlements"),
		op: z.literal("delete"),
		id: z.string().min(1),
	}),
]);

// The write-set of one command, table by table. Only the table a command writes
// today; every further table joins this union with its own row schema.
export const RowChangeSchema = CustomerEntitlementChangeSchema;

export type RowChange = z.infer<typeof RowChangeSchema>;
export type SubjectTable = RowChange["table"];
