import {
	cusProductToProduct,
	type FullCusProduct,
	featureOptionsAreSame,
	isCusProductOnEntity,
	type MultiAttachProductContext,
	productsAreSame,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseQuantityChanges } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";

const INSERTED_PLAN_QUANTITY = 1;

/** The requested plan is exactly this customer product: same plan version, scope, quantities and items. */
export const isUnchangedCustomerProduct = ({
	ctx,
	customerProduct,
	productContext,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	productContext: MultiAttachProductContext;
}) => {
	const {
		fullProduct,
		fullCustomer,
		featureQuantities,
		customerLicenseQuantities,
	} = productContext;

	const samePlanVersion =
		customerProduct.internal_product_id === fullProduct.internal_id;
	const sameScope = isCusProductOnEntity({
		cusProduct: customerProduct,
		internalEntityId: fullCustomer.entity?.internal_id,
	});
	const samePlanQuantity =
		(customerProduct.quantity ?? INSERTED_PLAN_QUANTITY) ===
		INSERTED_PLAN_QUANTITY;
	const sameLicenseQuantities =
		computeCustomerLicenseQuantityChanges({
			customerProduct,
			customerLicenseQuantities,
		}).length === 0;
	const sameFeatureQuantities = featureOptionsAreSame({
		curFeatureOptions: customerProduct.options ?? [],
		newFeatureOptions: featureQuantities,
	});
	const { itemsSame, freeTrialsSame } = productsAreSame({
		newProductV1: fullProduct,
		curProductV1: cusProductToProduct({ cusProduct: customerProduct }),
		features: ctx.features,
	});

	return (
		samePlanVersion &&
		sameScope &&
		samePlanQuantity &&
		sameLicenseQuantities &&
		sameFeatureQuantities &&
		itemsSame &&
		freeTrialsSame
	);
};
