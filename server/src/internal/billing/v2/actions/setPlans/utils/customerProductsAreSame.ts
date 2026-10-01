import {
	type CustomerLicenseQuantity,
	cusProductToProduct,
	type Feature,
	type FullCusProduct,
} from "@autumn/shared";
import { customerProductMatchesPlan } from "./isUnchangedCustomerProduct";

const DEFAULT_PLAN_QUANTITY = 1;

const customerProductToLicenseQuantities = (
	customerProduct: FullCusProduct,
): CustomerLicenseQuantity[] =>
	(customerProduct.customer_licenses ?? []).flatMap((customerLicense) =>
		customerLicense.planLicense
			? [
					{
						licensePlanId: customerLicense.planLicense.product.id,
						totalQuantity: customerLicense.granted,
					},
				]
			: [],
	);

/** Two customer products grant the same plan, using the equality billing uses to keep a plan untouched. */
export const customerProductsAreSame = ({
	features,
	before,
	after,
}: {
	features: Feature[];
	before: FullCusProduct;
	after: FullCusProduct;
}) =>
	customerProductMatchesPlan({
		features,
		customerProduct: before,
		requestedPlan: {
			fullProduct: {
				...cusProductToProduct({ cusProduct: after }),
				internal_id: after.internal_product_id,
			},
			featureQuantities: after.options ?? [],
			customerLicenseQuantities: customerProductToLicenseQuantities(after),
		},
		internalEntityId: after.internal_entity_id ?? undefined,
		planQuantity: after.quantity ?? DEFAULT_PLAN_QUANTITY,
	});
