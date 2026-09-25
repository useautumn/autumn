import {
	type CreateScheduleBillingContext,
	type CustomerLicenseQuantity,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";

const assertPlanOffersLicenses = ({
	fullProduct,
	customerLicenseQuantities = [],
}: {
	fullProduct: FullProduct;
	customerLicenseQuantities?: CustomerLicenseQuantity[];
}) => {
	const offeredLicensePlanIds = new Set(
		(fullProduct.licenses ?? []).map((link) => link.product.id),
	);
	for (const { licensePlanId } of customerLicenseQuantities) {
		if (offeredLicensePlanIds.has(licensePlanId)) continue;
		throw new RecaseError({
			message: `Plan ${fullProduct.id} does not offer license ${licensePlanId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

/** Every phase's license_quantities must name licenses its plan offers. */
export const handleCreateScheduleLicenseQuantityErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const productContexts = [
		...billingContext.productContexts,
		...billingContext.scheduledPhaseContexts.flatMap(
			(phaseContext) => phaseContext.productContexts,
		),
	];
	for (const productContext of productContexts) {
		assertPlanOffersLicenses(productContext);
	}
};
