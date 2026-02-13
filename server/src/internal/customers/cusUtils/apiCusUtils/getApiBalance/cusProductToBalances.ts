import type {
	ApiBalanceV1,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiBalance } from "./getApiBalance.js";

/**
 * Extract balances from a FullCusProduct's customer_entitlements.
 * Used for checkout preview to show what balances will be granted.
 */
export const cusProductToBalances = ({
	ctx,
	cusProduct,
	fullCustomer,
}: {
	ctx: RequestContext;
	cusProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Record<string, ApiBalanceV1> => {
	const balances: Record<string, ApiBalanceV1> = {};

	// Group customer_entitlements by feature_id
	const featureToCusEnts: Record<string, FullCusEntWithFullCusProduct[]> = {};

	for (const cusEnt of cusProduct.customer_entitlements) {
		const featureId = cusEnt.entitlement.feature.id;

		// Create FullCusEntWithFullCusProduct by attaching cusProduct
		const cusEntWithProduct: FullCusEntWithFullCusProduct = {
			...cusEnt,
			customer_product: cusProduct,
		};

		featureToCusEnts[featureId] = [
			...(featureToCusEnts[featureId] || []),
			cusEntWithProduct,
		];
	}

	// Build ApiBalance for each feature
	for (const featureId in featureToCusEnts) {
		const cusEnts = featureToCusEnts[featureId];
		const feature = cusEnts[0].entitlement.feature;

		// Create a preview FullCustomer with this product's entitlements
		const previewFullCus: FullCustomer = {
			...fullCustomer,
			customer_products: [cusProduct],
		};

		const { data } = getApiBalance({
			ctx,
			fullCus: previewFullCus,
			cusEnts,
			feature,
		});

		balances[featureId] = data;
	}

	return balances;
};
