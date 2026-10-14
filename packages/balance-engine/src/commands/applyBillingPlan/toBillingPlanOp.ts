import { workerCustomerSchema } from "../../models/subject/rows/workerCustomer.js";
import { workerCustomerEntitlementSchema } from "../../models/subject/rows/workerCustomerEntitlement.js";
import { workerCustomerPriceSchema } from "../../models/subject/rows/workerCustomerPrice.js";
import { workerCustomerProductSchema } from "../../models/subject/rows/workerCustomerProduct.js";
import { workerEntitySchema } from "../../models/subject/rows/workerEntity.js";
import { workerPooledBalanceSchema } from "../../models/subject/rows/workerPooledBalance.js";
import { workerPooledContributionSchema } from "../../models/subject/rows/workerPooledContribution.js";
import { workerRolloverSchema } from "../../models/subject/rows/workerRollover.js";
import { pickColumns } from "../../utils/subjectStateUtils/convertSubjectStateUtils.js";
import {
	type BillingPlanDeleteOp,
	type BillingPlanIncrementOp,
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
	pooledBalances: workerPooledBalanceSchema,
	pooledContributions: workerPooledContributionSchema,
} as const;

export type BillingPlanInsertTable = keyof typeof insertRowSchemas;
export type BillingPlanUpdateTable = BillingPlanUpdateOp["table"];
export type BillingPlanDeleteTable = BillingPlanDeleteOp["table"];

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

export const toBillingPlanUpdateOp = ({
	table,
	id,
	set,
	whereUnset,
}: {
	table: BillingPlanUpdateTable;
	id: string;
	set: object;
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
	share,
}: {
	table: BillingPlanDeleteTable;
	id: string;
	share?: { pooledBalanceId: string; sourceCustomerEntitlementId: string };
}): BillingPlanOp =>
	billingPlanOpSchema.parse({ op: "delete", table, id, ...share });

export const toBillingPlanAddRolloversOp = ({
	id,
	rows,
}: {
	id: string;
	rows: object[];
}): BillingPlanOp[] =>
	rows.length === 0
		? []
		: [
				billingPlanOpSchema.parse({
					op: "addRollovers",
					table: "rollovers",
					id,
					rows: rows.map((row) =>
						pickColumns({ schema: workerRolloverSchema, row }),
					),
				}),
			];

export const toBillingPlanMoveEntriesOp = ({
	id,
	moves,
}: {
	id: string;
	moves: Record<string, string>;
}): BillingPlanOp =>
	billingPlanOpSchema.parse({
		op: "moveEntries",
		table: "customerEntitlements",
		id,
		moves,
	});

export const toBillingPlanIncrementOp = ({
	table = "customerEntitlements",
	id,
	add,
	addEntries,
}: {
	table?: BillingPlanIncrementOp["table"];
	id: string;
	add: object;
	addEntries?: object;
}): BillingPlanOp =>
	billingPlanOpSchema.parse({
		op: "increment",
		table,
		id,
		add: definedColumns(add),
		...(addEntries ? { addEntries } : {}),
	});

export const toBillingPlanRebalanceOp = ({
	id,
	featureId,
	quantity,
	creditedId,
}: {
	id: string;
	featureId: string;
	quantity: number;
	creditedId: string | null;
}): BillingPlanOp =>
	billingPlanOpSchema.parse({
		op: "rebalance",
		table: "customerEntitlements",
		id,
		featureId,
		quantity,
		creditedId,
	});
