import type {
	BillingPlan,
	UpdateSubscriptionBillingContext,
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

export const handleBillingBehaviorErrors = ({
	billingContext,
	billingPlan,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
	params: UpdateSubscriptionV1Params;
}) => {
	const { autumn: autumnBillingPlan } = billingPlan;

	// Only validate when billing_behavior is 'next_cycle_only' (defer charges)
	if (params.billing_behavior !== "next_cycle_only") return;

	// Check 1: Free -> Paid transition
	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (newCustomerProduct) {
		const currentCustomerProduct = billingContext.customerProduct;

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

	// Block any operations that would result in a charge
	const chargeResult = billingPlanWillCharge({ billingPlan });

	if (chargeResult.willCharge) {
		throw new RecaseError({
			message: `Cannot set billing_behavior to 'next_cycle_only' when ${getChargeReasonMessage(chargeResult.reason)}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
