import type { FullProductWithoutLicenses } from "@autumn/shared";
import {
	type BasePriceTransition,
	computeBasePriceTransition,
} from "./computeBasePriceTransition";
import {
	type CustomerProductTransition,
	computeCustomerProductTransition,
} from "./computeCustomerProductTransition";
import {
	type ComputedEntitlementPriceTransitions,
	computeEntitlementPriceTransitions,
} from "./computeEntitlementPriceTransitions";

export type ProductTransitions = {
	basePrice: BasePriceTransition | undefined;
	customerProduct: CustomerProductTransition | undefined;
	entitlementPrices: ComputedEntitlementPriceTransitions;
	toProduct: FullProductWithoutLicenses;
};

export const computeProductTransitions = ({
	fromProduct,
	toProduct,
}: {
	fromProduct: FullProductWithoutLicenses;
	toProduct: FullProductWithoutLicenses;
}): ProductTransitions => ({
	basePrice: computeBasePriceTransition({ fromProduct, toProduct }),
	customerProduct: computeCustomerProductTransition({
		fromInternalProductId: fromProduct.internal_id,
		toInternalProductId: toProduct.internal_id,
	}),
	entitlementPrices: computeEntitlementPriceTransitions({
		fromProduct,
		toProduct,
	}),
	toProduct,
});
