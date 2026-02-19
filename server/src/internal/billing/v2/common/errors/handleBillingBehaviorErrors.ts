import type {
	AttachParamsV1,
	BillingContext,
	BillingPlan,
	FullCusProduct,
} from "@autumn/shared";
import {
	cusProductToPrices,
	ErrCode,
	isFreeProduct,
	RecaseError,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";
import {
	billingPlanWillCharge,
	getChargeReasonMessage,
} from "@/internal/billing/v2/utils/billingPlan/billingPlanWillCharge";

/**
 * Validates that billing_behavior: 'next_cycle_only' is not used
 * in scenarios where deferring charges is invalid:
 * 1. Free -> Paid transitions (must charge immediately)
 * 2. Trial -> Non-trial transitions (removing a trial)
 * 3. Any operation that would result in a charge
 */
export const handleBillingBehaviorErrors = ({
	billingContext,
	currentCustomerProduct,
	billingPlan,
	params,
}: {
	billingContext: BillingContext;
	currentCustomerProduct?: FullCusProduct;
	billingPlan: BillingPlan;
	params: UpdateSubscriptionV1Params | AttachParamsV1;
}) => {
	// Only validate when billing_behavior is 'next_cycle_only' (defer charges)
	if (params.billing_behavior !== "none") return;

	const { autumn: autumnBillingPlan } = billingPlan;

	// Check 1: Free -> Paid transition
	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (newCustomerProduct && currentCustomerProduct) {
		const currentPrices = cusProductToPrices({
			cusProduct: currentCustomerProduct,
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

	// Check 3: Block any operations that would result in a charge
	const chargeResult = billingPlanWillCharge({ billingPlan });

	if (chargeResult.willCharge) {
		throw new RecaseError({
			message: `Cannot set billing_behavior to 'next_cycle_only' when ${getChargeReasonMessage(chargeResult.reason)}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
