import {
	type AttachParamsV0,
	cusProductToPrices,
	cusProductToProcessorType,
	ErrCode,
	isPrepaidPrice,
	ProcessorType,
	RecaseError,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	AttachBillingContext,
	AutumnBillingPlan,
} from "@/internal/billing/v2/types";

/**
 * Validates that we're not trying to modify a customer managed by an external PSP like RevenueCat.
 */
const handleExternalPSPErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { currentCustomerProduct } = billingContext;

	if (!currentCustomerProduct) return;

	const processorType = cusProductToProcessorType(currentCustomerProduct);
	if (processorType === ProcessorType.RevenueCat) {
		throw new RecaseError({
			message: `Cannot attach '${billingContext.attachProduct.name}' because the customer's current product is managed by RevenueCat.`,
		});
	}
};

/**
 * Validates that prepaid prices have quantities specified in options.
 */
const handlePrepaidQuantityErrors = ({
	autumnBillingPlan,
	billingContext,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: AttachBillingContext;
}) => {
	// Skip validation if going to checkout (quantities can be collected there)
	if (billingContext.checkoutMode === "stripe_checkout") return;

	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (!newCustomerProduct) return;

	const newPrices = cusProductToPrices({ cusProduct: newCustomerProduct });
	const prepaidPrices = newPrices.filter(isPrepaidPrice);

	if (prepaidPrices.length === 0) return;

	const options = newCustomerProduct.options ?? [];
	const missingFeatures: string[] = [];

	for (const price of prepaidPrices) {
		const config = price.config as UsagePriceConfig;
		const internalFeatureId = config.internal_feature_id;

		const hasOption = options.some(
			(opt) => opt.internal_feature_id === internalFeatureId,
		);

		if (!hasOption) {
			const cusEnt = newCustomerProduct.customer_entitlements?.find(
				(ce) => ce.entitlement.internal_feature_id === internalFeatureId,
			);
			const featureId = cusEnt?.entitlement.feature_id ?? internalFeatureId;
			missingFeatures.push(featureId);
		}
	}

	if (missingFeatures.length > 0) {
		throw new RecaseError({
			message: `Missing quantity options for prepaid features: ${missingFeatures.join(", ")}`,
			code: ErrCode.InvalidOptions,
			statusCode: 400,
		});
	}
};

/**
 * Validates that negative quantities are not passed.
 */
const handleNegativeQuantityErrors = ({
	params,
}: {
	params: AttachParamsV0;
}) => {
	for (const option of params.options ?? []) {
		if (option.quantity !== undefined && option.quantity < 0) {
			throw new RecaseError({
				message: "Quantity cannot be negative",
				code: ErrCode.InvalidOptions,
				statusCode: 400,
			});
		}
	}
};

/**
 * Validates attach v2 request before executing the billing plan.
 */
export const handleAttachV2Errors = ({
	ctx: _ctx,
	billingContext,
	autumnBillingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	params: AttachParamsV0;
}) => {
	// 1. External PSP errors (RevenueCat)
	handleExternalPSPErrors({ billingContext });

	// 2. Negative quantity errors
	handleNegativeQuantityErrors({ params });

	// 3. Prepaid quantity errors
	handlePrepaidQuantityErrors({ autumnBillingPlan, billingContext });
};
