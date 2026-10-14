import {
	type BillingPlanOp,
	toBillingPlanInsertOp,
} from "@autumn/balance-engine";
import type {
	AutumnBillingPlan,
	InsertCustomerEntitlement,
} from "@autumn/shared";

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

export const insertCustomerEntitlementsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => {
	const creditedId =
		autumnBillingPlan.autoTopupRebalance?.creditedCustomerEntitlementId;
	return (autumnBillingPlan.insertCustomerEntitlements ?? []).map((row) =>
		toBillingPlanInsertOp({
			table: "customerEntitlements",
			row: {
				...withTableDefaults(row),
				...(row.id === creditedId ? { balance: 0 } : {}),
			},
		}),
	);
};
