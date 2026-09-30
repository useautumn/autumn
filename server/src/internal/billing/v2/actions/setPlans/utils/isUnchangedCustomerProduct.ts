import {
	type FullCusProduct,
	isCusProductOnEntity,
	type MultiAttachProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseQuantityChanges } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";
import { pendingPlanRebills } from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingPlanRebills";

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

	return (
		samePlanVersion &&
		sameScope &&
		samePlanQuantity &&
		sameLicenseQuantities &&
		!pendingPlanRebills({
			ctx,
			customerProduct,
			replacementProduct: fullProduct,
			replacementQuantities: featureQuantities,
		})
	);
};
