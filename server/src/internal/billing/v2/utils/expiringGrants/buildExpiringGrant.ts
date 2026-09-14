import type {
	CustomerEntitlementSource,
	Entitlement,
	FullCusEntWithFullCusProduct,
	InsertCustomerEntitlement,
} from "@autumn/shared";
import {
	initCarryOverCustomerEntitlement,
	initCarryOverEntitlement,
} from "@/internal/billing/v2/utils/handleCarryOvers/initCarryOverEntitlements";
import { entitlementToExpiry, initExpiresAt } from "./entitlementExpiry";

/**
 * A purchased balance that expires on its own clock. Loose (no customer
 * product) so it outlives the plan, with its own custom entitlement so the
 * plan's item set — and `is_custom` — never change. The entitlement's own
 * allowance IS the purchase, so granted reports it once and usage stays 0.
 */
export const buildExpiringGrant = ({
	sourceCustomerEntitlement,
	amount,
	source,
	orgId,
	now,
}: {
	sourceCustomerEntitlement: FullCusEntWithFullCusProduct;
	amount: number;
	source: CustomerEntitlementSource;
	orgId: string;
	now: number;
}): {
	entitlement: Entitlement;
	customerEntitlement: InsertCustomerEntitlement;
} | null => {
	const expiry = entitlementToExpiry({
		entitlement: sourceCustomerEntitlement.entitlement,
	});
	if (!expiry || amount <= 0) return null;

	const customerProduct = sourceCustomerEntitlement.customer_product;

	const entitlement = initCarryOverEntitlement({
		cusEnt: sourceCustomerEntitlement,
		orgId,
		allowance: amount,
	});

	const customerEntitlement: InsertCustomerEntitlement = {
		...initCarryOverCustomerEntitlement({
			cusEnt: sourceCustomerEntitlement,
			entitlementId: entitlement.id,
			internalCustomerId: sourceCustomerEntitlement.internal_customer_id,
			customerId: sourceCustomerEntitlement.customer_id,
			internalEntityId: sourceCustomerEntitlement.internal_entity_id ?? null,
			balance: amount,
			expiresAt: initExpiresAt({ expiry, now }),
		}),
		metadata: {
			source,
			plan_id: customerProduct?.product?.id ?? null,
			customer_product_id: customerProduct?.id ?? null,
		},
	};

	return { entitlement, customerEntitlement };
};
