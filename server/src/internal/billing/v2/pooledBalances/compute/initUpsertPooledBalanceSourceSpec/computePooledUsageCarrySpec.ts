import {
	cusEntsToUsage,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type PooledBalanceUsageReapply,
} from "@autumn/shared";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";

// Carries used units when the outgoing product granted the same feature NON-pooled.
export const computePooledUsageCarrySpec = ({
	customerEntitlement,
	outgoingCustomerProduct,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	outgoingCustomerProduct?: FullCusProduct;
}): PooledBalanceUsageReapply | undefined => {
	if (!outgoingCustomerProduct) return undefined;

	const hasNonPooledSource = outgoingCustomerProduct.customer_entitlements.some(
		(sourceCustomerEntitlement) =>
			!isPooledSourceCustomerEntitlement({
				customerEntitlement: sourceCustomerEntitlement,
				customerProduct: outgoingCustomerProduct,
			}) &&
			sourceCustomerEntitlement.internal_feature_id ===
				customerEntitlement.internal_feature_id,
	);

	if (!hasNonPooledSource) return undefined;

	const amount = cusEntsToUsage({
		cusEnts: [customerEntitlement],
	});

	if (!(amount > 0)) return undefined;

	return {
		amount,
		excludedSourceCustomerProductId: outgoingCustomerProduct.id,
	};
};
