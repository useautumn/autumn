import {
	type AttachBillingContext,
	type AttachParamsV1,
	type AutumnBillingPlan,
	cusProductToPrices,
	ErrCode,
	isFreeProduct,
	RecaseError,
} from "@autumn/shared";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

/**
 * Validates that billing_behavior: 'next_cycle_only' is not used
 * in scenarios where deferring charges is invalid:
 * 1. Free → Paid transitions (must charge immediately)
 * 2. Trial → Non-trial transitions (removing a trial)
 */
export const handleAttachBillingBehaviorErrors = ({
	billingContext,
	autumnBillingPlan,
	params,
}: {
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	params: AttachParamsV1;
}) => {
	// Only validate when billing_behavior is 'next_cycle_only' (defer charges)
	if (params.billing_behavior !== "next_cycle_only") return;

	// Check 1: Free -> Paid transition
	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (newCustomerProduct && billingContext.currentCustomerProduct) {
		const currentPrices = cusProductToPrices({
			cusProduct: billingContext.currentCustomerProduct,
		});
		const newPrices = cusProductToPrices({ cusProduct: newCustomerProduct });

		const currentIsFree = isFreeProduct({ prices: currentPrices });
		const newIsFree = isFreeProduct({ prices: newPrices });

		if (currentIsFree && !newIsFree) {
			throw new RecaseError({
				message:
					"Cannot set billing_behavior to 'next_cycle_only' when upgrading from a free product to a paid product",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	// Check 2: Trial -> Non-trial transition (removing trial)
	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	if (isTrialing && !willBeTrialing) {
		throw new RecaseError({
			message:
				"Cannot set billing_behavior to 'next_cycle_only' when removing a free trial",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
