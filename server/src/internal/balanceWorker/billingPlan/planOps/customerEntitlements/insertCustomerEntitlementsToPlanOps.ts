import {
	type BillingPlanOp,
	toBillingPlanInsertOp,
} from "@autumn/balance-engine";
import type {
	AutumnBillingPlan,
	InsertCustomerEntitlement,
} from "@autumn/shared";

/** An insert row may leave columns to their Postgres defaults; the worker stores them filled in. */
const withTableDefaults = (row: InsertCustomerEntitlement) => ({
	...row,
	customer_product_id: row.customer_product_id ?? null,
	internal_entity_id: row.internal_entity_id ?? null,
	balance: row.balance ?? 0,
	adjustment: row.adjustment ?? 0,
	additional_balance: row.additional_balance ?? 0,
	separate_interval: row.separate_interval ?? false,
	usage_allowed: row.usage_allowed ?? false,
	next_reset_at: row.next_reset_at ?? null,
	expires_at: row.expires_at ?? null,
	external_id: row.external_id ?? null,
});

/** Loose grants the plan adds beside any product, such as an expiring top-up. */
export const insertCustomerEntitlementsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	(autumnBillingPlan.insertCustomerEntitlements ?? []).map((row) =>
		toBillingPlanInsertOp({
			table: "customerEntitlements",
			row: withTableDefaults(row),
		}),
	);
