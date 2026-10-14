import { getApiBalance } from "@api/customers/cusFeatures";
import type {
	ApiBalanceV1,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";

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

	const featureToCusEnts: Record<string, FullCusEntWithFullCusProduct[]> = {};

	for (const cusEnt of cusProduct.customer_entitlements) {
		const featureId = cusEnt.entitlement.feature.id;

		const cusEntWithProduct: FullCusEntWithFullCusProduct = {
			...cusEnt,
			customer_product: cusProduct,
		};

		featureToCusEnts[featureId] = [
			...(featureToCusEnts[featureId] || []),
			cusEntWithProduct,
		];
	}

	for (const featureId in featureToCusEnts) {
		const cusEnts = featureToCusEnts[featureId];
		const feature = cusEnts[0].entitlement.feature;

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
