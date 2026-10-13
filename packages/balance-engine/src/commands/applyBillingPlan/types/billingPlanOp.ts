import { z } from "zod/v4";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";
import {
	customerEntitlementIncrementParts,
	pooledBalanceIncrementParts,
} from "../../../models/mutation/rowIncrement.js";
import { workerCustomerSchema } from "../../../models/subject/rows/workerCustomer.js";
import { workerCustomerEntitlementSchema } from "../../../models/subject/rows/workerCustomerEntitlement.js";
import { workerCustomerPriceSchema } from "../../../models/subject/rows/workerCustomerPrice.js";
import { workerCustomerProductSchema } from "../../../models/subject/rows/workerCustomerProduct.js";
import { workerEntitySchema } from "../../../models/subject/rows/workerEntity.js";
import { workerPooledBalanceSchema } from "../../../models/subject/rows/workerPooledBalance.js";
import { workerPooledContributionSchema } from "../../../models/subject/rows/workerPooledContribution.js";
import { workerRolloverSchema } from "../../../models/subject/rows/workerRollover.js";

const insertOf = <Table extends string, RowSchema extends z.ZodObject>({
	table,
	rowSchema,
}: {
	table: Table;
	rowSchema: RowSchema;
}) =>
	z
		.object({
			op: z.literal("insert"),
			table: z.literal(table),
			row: rowSchema,
		})
		.loose();

const deleteOf = <Table extends string>({ table }: { table: Table }) =>
	z
		.object({
			op: z.literal("delete"),
			table: z.literal(table),
			id: nonEmptyStringSchema,
		})
		.loose();

const setsAColumn = (set: object): boolean => Object.keys(set).length > 0;

/** Columns an update replaces: never the row's keys, and at least one. */
const updateSetOf = <RowSchema extends z.ZodObject, Key extends string>({
	rowSchema,
	keys,
}: {
	rowSchema: RowSchema;
	keys: readonly Key[];
}) =>
	rowSchema
		.omit(
			Object.fromEntries(keys.map((key) => [key, true])) as Record<Key, true>,
		)
		.partial()
		.refine(setsAColumn, "An update sets no columns")
		.refine(
			(set) => keys.every((key) => !(key in set)),
			`An update never sets ${keys.join(", ")}`,
		);

const customerUpdateSetSchema = updateSetOf({
	rowSchema: workerCustomerSchema,
	keys: ["internal_id"],
});

const customerProductUpdateSetSchema = updateSetOf({
	rowSchema: workerCustomerProductSchema,
	keys: ["id"],
});

const customerEntitlementUpdateSetSchema = updateSetOf({
	rowSchema: workerCustomerEntitlementSchema,
	keys: ["id"],
});

/** A share's values, replaced whole; the row's id and pool never change. */
const pooledContributionUpdateSetSchema = updateSetOf({
	rowSchema: workerPooledContributionSchema,
	keys: ["id", "pooled_balance_id"],
});

/** A pool's lifecycle columns; its grant moves by increment, its balance lives on POOL_CE. */
const pooledBalanceLifecycleColumns = new Set([
	"reset_cycle_anchor",
	"stripe_subscription_id",
	"customer_license_link_id",
	"updated_at",
]);
const pooledBalanceUpdateSetSchema = updateSetOf({
	rowSchema: workerPooledBalanceSchema,
	keys: Object.keys(workerPooledBalanceSchema.shape).filter(
		(column) => !pooledBalanceLifecycleColumns.has(column),
	),
});

const insertOpSchema = z.discriminatedUnion("table", [
	insertOf({ table: "customer", rowSchema: workerCustomerSchema }),
	insertOf({ table: "entity", rowSchema: workerEntitySchema }),
	insertOf({
		table: "customerProducts",
		rowSchema: workerCustomerProductSchema,
	}),
	insertOf({ table: "customerPrices", rowSchema: workerCustomerPriceSchema }),
	insertOf({
		table: "customerEntitlements",
		rowSchema: workerCustomerEntitlementSchema,
	}),
	insertOf({ table: "rollovers", rowSchema: workerRolloverSchema }),
	insertOf({ table: "pooledBalances", rowSchema: workerPooledBalanceSchema }),
	/** Never a state row: the engine zeroes its source and moves the pool's grant, the committer writes it. */
	insertOf({
		table: "pooledContributions",
		rowSchema: workerPooledContributionSchema,
	}),
]);

/** A customer update names the row by `internal_id`, every other row by `id`. */
const updateOpSchema = z.discriminatedUnion("table", [
	z
		.object({
			op: z.literal("update"),
			table: z.literal("customer"),
			id: nonEmptyStringSchema,
			set: customerUpdateSetSchema,
			/** Only where the row still holds null in every column it sets; otherwise the op changes nothing. */
			whereUnset: z.literal(true).optional(),
		})
		.loose(),
	z
		.object({
			op: z.literal("update"),
			table: z.literal("customerProducts"),
			id: nonEmptyStringSchema,
			set: customerProductUpdateSetSchema,
		})
		.loose(),
	z
		.object({
			op: z.literal("update"),
			table: z.literal("customerEntitlements"),
			id: nonEmptyStringSchema,
			set: customerEntitlementUpdateSetSchema,
		})
		.loose(),
	z
		.object({
			op: z.literal("update"),
			table: z.literal("pooledBalances"),
			id: nonEmptyStringSchema,
			set: pooledBalanceUpdateSetSchema,
		})
		.loose(),
	z
		.object({
			op: z.literal("update"),
			table: z.literal("pooledContributions"),
			id: nonEmptyStringSchema,
			set: pooledContributionUpdateSetSchema,
		})
		.loose(),
]);

/** A deleted product takes its prices and grants with it, and a grant its rollovers, as Postgres cascades. */
const deleteOpSchema = z.discriminatedUnion("table", [
	deleteOf({ table: "customerProducts" }),
	deleteOf({ table: "customerPrices" }),
	deleteOf({ table: "customerEntitlements" }),
	deleteOf({ table: "rollovers" }),
	deleteOf({ table: "pooledBalances" }),
	/** Names its pool and source: the plan releases the source, the worker asks whether the pool keeps any share. The row itself is not state. */
	z
		.object({
			op: z.literal("delete"),
			table: z.literal("pooledContributions"),
			id: nonEmptyStringSchema,
			pooledBalanceId: nonEmptyStringSchema,
			sourceCustomerEntitlementId: nonEmptyStringSchema,
		})
		.loose(),
]);

/** Counters moved by a delta, so a plan's rebalance composes with the tracks decided before it. */
const incrementOpSchema = z.discriminatedUnion("table", [
	z
		.object({
			op: z.literal("increment"),
			table: z.literal("customerEntitlements"),
			id: nonEmptyStringSchema,
			add: customerEntitlementIncrementParts.add,
			addEntries: customerEntitlementIncrementParts.entries.optional(),
		})
		.loose(),
	z
		.object({
			op: z.literal("increment"),
			table: z.literal("pooledBalances"),
			id: nonEmptyStringSchema,
			add: pooledBalanceIncrementParts.add,
		})
		.loose(),
]);

/** Per-entity entries re-keyed (`from → to`), resolved against the live map: a freed seat's balance returning to a new entity. */
const moveEntriesOpSchema = z
	.object({
		op: z.literal("moveEntries"),
		table: z.literal("customerEntitlements"),
		id: nonEmptyStringSchema,
		moves: z.record(nonEmptyStringSchema, nonEmptyStringSchema),
	})
	.loose();

/** A purchase sized against the rows as the plan's other ops leave them: rows in overage paid down to 0, the rest credited. */
const rebalanceOpSchema = z
	.object({
		op: z.literal("rebalance"),
		table: z.literal("customerEntitlements"),
		/** The purchased row; its owner is the subject whose rows are paid down. */
		id: nonEmptyStringSchema,
		featureId: nonEmptyStringSchema,
		quantity: finiteNumberSchema,
		/** The row credited with what is left; null credits the first row paid down. */
		creditedId: nonEmptyStringSchema.nullable(),
	})
	.loose();

/** New rollover rows for a held grant. Not a plain insert: the grant's rollover cap may trim the rows it already holds, which needs its catalog, so it resolves after the core plan. */
const addRolloversOpSchema = z
	.object({
		op: z.literal("addRollovers"),
		table: z.literal("rollovers"),
		/** The grant that receives them; its owner is the subject whose rows are capped. */
		id: nonEmptyStringSchema,
		rows: z.array(workerRolloverSchema).min(1),
	})
	.loose();

/** One change a billing plan makes to the subject's rows. */
export const billingPlanOpSchema = z.discriminatedUnion("op", [
	insertOpSchema,
	updateOpSchema,
	deleteOpSchema,
	incrementOpSchema,
	moveEntriesOpSchema,
	rebalanceOpSchema,
	addRolloversOpSchema,
]);

export type BillingPlanOp = z.infer<typeof billingPlanOpSchema>;
export type BillingPlanInsertOp = z.infer<typeof insertOpSchema>;
export type BillingPlanUpdateOp = z.infer<typeof updateOpSchema>;
export type BillingPlanDeleteOp = z.infer<typeof deleteOpSchema>;
export type BillingPlanIncrementOp = z.infer<typeof incrementOpSchema>;
export type BillingPlanMoveEntriesOp = z.infer<typeof moveEntriesOpSchema>;
export type BillingPlanRebalanceOp = z.infer<typeof rebalanceOpSchema>;
export type BillingPlanAddRolloversOp = z.infer<typeof addRolloversOpSchema>;
/** Every op but a rebalance or new rollovers: each converts on its own, against the rows as found. */
export type BillingPlanRowOp = Exclude<
	BillingPlanOp,
	BillingPlanRebalanceOp | BillingPlanAddRolloversOp
>;
