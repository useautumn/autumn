import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import {
	addCusProductToCusEnt,
	isPaidCustomerEntitlement,
} from "@utils/cusEntUtils";
import { isConsumableFeature } from "@utils/featureUtils/classifyFeature/isConsumableFeature";

/**
 * Get all consumable (resettable) features for a customer product.
 *
 * When THIS customer product is attached, carry usages for these entitlements.
 * That is, return customer_entitlements for features whose usage is tracked/reset periodically.
 */
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
