import type { FullCustomer } from "@autumn/shared";

/**
 * Builds a Record mapping entitlement IDs to their array indices within
 * the FullCustomer cache value, ready for HSET into the path index.
 *
 * Entry format for product entitlements: { cp, ce, ef }
 * Entry format for extra (loose) entitlements: { ece, ef }
 *
 * The Lua script constructs the JSON path at read time from these indices.
 */
export const buildPathIndex = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): Record<string, string> => {
	const entries: Record<string, string> = {};

	for (let cpIdx = 0; cpIdx < fullCustomer.customer_products.length; cpIdx++) {
		const customerProduct = fullCustomer.customer_products[cpIdx];
		for (
			let ceIdx = 0;
			ceIdx < customerProduct.customer_entitlements.length;
			ceIdx++
		) {
			const customerEntitlement = customerProduct.customer_entitlements[ceIdx];
			const entityFeatureId =
				customerEntitlement.entitlement?.entity_feature_id ?? null;

			entries[`cus_ent:${customerEntitlement.id}`] = JSON.stringify({
				cp: cpIdx,
				ce: ceIdx,
				ef: entityFeatureId,
			});
		}
	}

	if (fullCustomer.extra_customer_entitlements) {
		for (
			let eceIdx = 0;
			eceIdx < fullCustomer.extra_customer_entitlements.length;
			eceIdx++
		) {
			const extraCustomerEntitlement =
				fullCustomer.extra_customer_entitlements[eceIdx];
			const entityFeatureId =
				extraCustomerEntitlement.entitlement?.entity_feature_id ?? null;

			entries[`cus_ent:${extraCustomerEntitlement.id}`] = JSON.stringify({
				ece: eceIdx,
				ef: entityFeatureId,
			});
		}
	}

	return entries;
};
