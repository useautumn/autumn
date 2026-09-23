import { workerCustomerSchema } from "../../models/subject/rows/workerCustomer.js";
import { workerCustomerEntitlementSchema } from "../../models/subject/rows/workerCustomerEntitlement.js";
import { workerCustomerPriceSchema } from "../../models/subject/rows/workerCustomerPrice.js";
import { workerCustomerProductSchema } from "../../models/subject/rows/workerCustomerProduct.js";
import { workerEntitySchema } from "../../models/subject/rows/workerEntity.js";
import { workerRolloverSchema } from "../../models/subject/rows/workerRollover.js";
import { pickColumns } from "../../utils/subjectStateUtils/convertSubjectStateUtils.js";
import {
	type BillingPlanDeleteOp,
	type BillingPlanOp,
	type BillingPlanUpdateOp,
	billingPlanOpSchema,
} from "./types/billingPlanOp.js";

const insertRowSchemas = {
	customer: workerCustomerSchema,
	entity: workerEntitySchema,
	customerProducts: workerCustomerProductSchema,
	customerPrices: workerCustomerPriceSchema,
	customerEntitlements: workerCustomerEntitlementSchema,
	rollovers: workerRolloverSchema,
} as const;

export type BillingPlanInsertTable = keyof typeof insertRowSchemas;
export type BillingPlanUpdateTable = BillingPlanUpdateOp["table"];
export type BillingPlanDeleteTable = BillingPlanDeleteOp["table"];

/** An insert of the row cut to the columns the worker stores; the server's rows carry joined fields too. */
export const toBillingPlanInsertOp = ({
	table,
	row,
}: {
	table: BillingPlanInsertTable;
	row: object;
}): BillingPlanOp =>
	billingPlanOpSchema.parse({
		op: "insert",
		table,
		row: pickColumns({ schema: insertRowSchemas[table], row }),
	});

const definedColumns = (record: object): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	);

/** An update of the columns `set` names; an undefined value names nothing. */
export const toBillingPlanUpdateOp = ({
	table,
	id,
	set,
	whereUnset,
}: {
	table: BillingPlanUpdateTable;
	id: string;
	set: object;
	/** Customer only: set the columns only where the row still holds null. */
	whereUnset?: true;
}): BillingPlanOp =>
	billingPlanOpSchema.parse({
		op: "update",
		table,
		id,
		set: definedColumns(set),
		...(whereUnset ? { whereUnset } : {}),
	});

export const toBillingPlanDeleteOp = ({
	table,
	id,
}: {
	table: BillingPlanDeleteTable;
	id: string;
}): BillingPlanOp => billingPlanOpSchema.parse({ op: "delete", table, id });

/** A grant's counters moved by `add`; zero deltas name nothing. */
export const toBillingPlanIncrementOp = ({
	id,
	add,
	addEntries,
}: {
	id: string;
	add: object;
	addEntries?: object;
}): BillingPlanOp =>
	billingPlanOpSchema.parse({
		op: "increment",
		table: "customerEntitlements",
		id,
		add: definedColumns(add),
		...(addEntries ? { addEntries } : {}),
	});
