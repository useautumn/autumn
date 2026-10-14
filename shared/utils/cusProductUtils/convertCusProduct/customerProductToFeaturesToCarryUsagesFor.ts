import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import {
	addCusProductToCusEnt,
	isPaidCustomerEntitlement,
} from "@utils/cusEntUtils";
import { isConsumableFeature } from "@utils/featureUtils/classifyFeature/isConsumableFeature";

export const customerProductToFeaturesToCarryUsagesFor = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const cusEnts = cusProduct.customer_entitlements;

	return cusEnts
		.filter((ce) => {
			const cusEntWithCusProduct = addCusProductToCusEnt({
				cusEnt: ce,
				cusProduct,
			});
			const ent = ce.entitlement;
			if (isConsumableFeature(ent.feature)) {
				const isPaid = isPaidCustomerEntitlement(cusEntWithCusProduct);
				if (isPaid) return false;

				if (ent.carry_from_previous) {
					return true;
				}
				return false;
			}

			return false;
		})
		.map((ce) => ce.entitlement.feature);
};
