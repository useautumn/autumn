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
		.strict();

const deleteOf = <Table extends string>({ table }: { table: Table }) =>
	z
		.object({
			op: z.literal("delete"),
			table: z.literal(table),
			id: nonEmptyStringSchema,
		})
		.strict();

const setsAColumn = (set: object): boolean => Object.keys(set).length > 0;

/** Columns an update replaces: never the row's key, and at least one. */
const customerUpdateSetSchema = workerCustomerSchema
	.omit({ internal_id: true })
	.partial()
	.refine(setsAColumn, "An update sets no columns");

const customerProductUpdateSetSchema = workerCustomerProductSchema
	.omit({ id: true })
	.partial()
	.refine(setsAColumn, "An update sets no columns");

const customerEntitlementUpdateSetSchema = workerCustomerEntitlementSchema
	.omit({ id: true })
	.partial()
	.refine(setsAColumn, "An update sets no columns");

/** A share's values, replaced whole; the row's id and pool never change. */
const pooledContributionUpdateSetSchema = workerPooledContributionSchema
	.omit({ id: true, pooled_balance_id: true })
	.partial()
	.refine(setsAColumn, "An update sets no columns");

/** A pool's lifecycle columns; its grant moves by increment, its balance lives on POOL_CE. */
const pooledBalanceUpdateSetSchema = workerPooledBalanceSchema
	.pick({
		reset_cycle_anchor: true,
		stripe_subscription_id: true,
		customer_license_link_id: true,
		updated_at: true,
	})
	.partial()
	.refine(setsAColumn, "An update sets no columns");

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
		.strict(),
	z
		.object({
			op: z.literal("update"),
			table: z.literal("customerProducts"),
			id: nonEmptyStringSchema,
			set: customerProductUpdateSetSchema,
		})
		.strict(),
	z
		.object({
			op: z.literal("update"),
			table: z.literal("customerEntitlements"),
			id: nonEmptyStringSchema,
			set: customerEntitlementUpdateSetSchema,
		})
		.strict(),
	z
		.object({
			op: z.literal("update"),
			table: z.literal("pooledBalances"),
			id: nonEmptyStringSchema,
			set: pooledBalanceUpdateSetSchema,
		})
		.strict(),
	z
		.object({
			op: z.literal("update"),
			table: z.literal("pooledContributions"),
			id: nonEmptyStringSchema,
			set: pooledContributionUpdateSetSchema,
		})
		.strict(),
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
		.strict(),
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
		.strict(),
	z
		.object({
			op: z.literal("increment"),
			table: z.literal("pooledBalances"),
			id: nonEmptyStringSchema,
			add: pooledBalanceIncrementParts.add,
		})
		.strict(),
]);

/** Per-entity entries re-keyed (`from → to`), resolved against the live map: a freed seat's balance returning to a new entity. */
const moveEntriesOpSchema = z
	.object({
		op: z.literal("moveEntries"),
		table: z.literal("customerEntitlements"),
		id: nonEmptyStringSchema,
		moves: z.record(nonEmptyStringSchema, nonEmptyStringSchema),
	})
	.strict();

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
	.strict();

/** One change a billing plan makes to the subject's rows. */
export const billingPlanOpSchema = z.discriminatedUnion("op", [
	insertOpSchema,
	updateOpSchema,
	deleteOpSchema,
	incrementOpSchema,
	moveEntriesOpSchema,
	rebalanceOpSchema,
]);

export type BillingPlanOp = z.infer<typeof billingPlanOpSchema>;
export type BillingPlanInsertOp = z.infer<typeof insertOpSchema>;
export type BillingPlanUpdateOp = z.infer<typeof updateOpSchema>;
export type BillingPlanDeleteOp = z.infer<typeof deleteOpSchema>;
export type BillingPlanIncrementOp = z.infer<typeof incrementOpSchema>;
export type BillingPlanMoveEntriesOp = z.infer<typeof moveEntriesOpSchema>;
export type BillingPlanRebalanceOp = z.infer<typeof rebalanceOpSchema>;
/** Every op but a rebalance: each converts on its own, against the rows as found. */
export type BillingPlanRowOp = Exclude<BillingPlanOp, BillingPlanRebalanceOp>;
