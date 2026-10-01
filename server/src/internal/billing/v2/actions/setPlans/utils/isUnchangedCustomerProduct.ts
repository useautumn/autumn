import {
	cusProductToProduct,
	type Feature,
	type FullCusProduct,
	featureOptionsAreSame,
	isCusProductOnEntity,
	type MultiAttachProductContext,
	productsAreSame,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseQuantityChanges } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";

const INSERTED_PLAN_QUANTITY = 1;

export type RequestedPlan = Pick<
	MultiAttachProductContext,
	"fullProduct" | "featureQuantities" | "customerLicenseQuantities"
>;

/** The customer product is exactly this plan: same plan version, scope, quantities and items. */
export const customerProductMatchesPlan = ({
	features,
	customerProduct,
	requestedPlan,
	internalEntityId,
	planQuantity,
}: {
	features: Feature[];
	customerProduct: FullCusProduct;
	requestedPlan: RequestedPlan;
	internalEntityId: string | undefined;
	planQuantity: number;
}) => {
	const { fullProduct, featureQuantities, customerLicenseQuantities } =
		requestedPlan;

	const samePlanVersion =
		customerProduct.internal_product_id === fullProduct.internal_id;
	const sameScope = isCusProductOnEntity({
		cusProduct: customerProduct,
		internalEntityId,
	});
	const samePlanQuantity =
		(customerProduct.quantity ?? INSERTED_PLAN_QUANTITY) === planQuantity;
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
		features,
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

/** The requested plan is exactly this customer product: same plan version, scope, quantities and items. */
export const isUnchangedCustomerProduct = ({
	ctx,
	customerProduct,
	productContext,
	internalEntityId,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	productContext: RequestedPlan;
	internalEntityId: string | undefined;
}) =>
	customerProductMatchesPlan({
		features: ctx.features,
		customerProduct,
		requestedPlan: productContext,
		internalEntityId,
		planQuantity: INSERTED_PLAN_QUANTITY,
	});
