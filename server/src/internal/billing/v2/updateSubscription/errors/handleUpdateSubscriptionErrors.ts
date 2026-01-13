import { ProcessorType, RecaseError } from "@autumn/shared";
import { cusProductToProcessorType } from "@shared/utils/cusProductUtils/convertCusProduct";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan";
import { handleFeatureQuantityErrors } from "./handleFeatureQuantityErrors";
import { handleProductTypeTransitionErrors } from "./handleProductTypeTransitionErrors";

export const handleUpdateSubscriptionErrors = async ({
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { customerProduct } = billingContext;

	// 1. RevenueCat error
	if (cusProductToProcessorType(customerProduct) === ProcessorType.RevenueCat) {
		throw new RecaseError({
			message: `Cannot update '${customerProduct.product.name}' because it is managed by RevenueCat.`,
		});
	}

	// 2. Product type transition errors
	handleProductTypeTransitionErrors({ billingContext, autumnBillingPlan });

	// 3. Feature quantity errors (prepaid prices must have options)
	handleFeatureQuantityErrors({ billingContext, autumnBillingPlan });
};
