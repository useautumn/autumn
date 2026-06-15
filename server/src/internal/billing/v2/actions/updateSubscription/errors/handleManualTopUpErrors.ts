import {
	DocsLinks,
	ErrCode,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

import { COMPLEX_UPDATE_ERROR } from "./handleOneOffErrors";

/** Mutation fields incompatible with manual top-up semantics (plan restructures,
 * cancel flows, internal lifecycle overrides). Utility / response-shaping fields
 * like `proration_behavior`, `discounts`, `expand`, `customer_data` are allowed. */
const FORBIDDEN_FIELDS: readonly (keyof UpdateSubscriptionV1Params)[] = [
	"customize",
	"version",
	"cancel_action",
	"billing_cycle_anchor",
	"refund_last_payment",
	"recalculate_balances",
	"status",
	"processor_subscription_id",
];

export const handleManualTopUpErrors = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}) => {
	if (billingContext.intent !== UpdateSubscriptionIntent.ManualTopUp) return;

	const featureQuantities = params.feature_quantities ?? [];
	if (featureQuantities.length !== 1) {
		throw new RecaseError({
			message: COMPLEX_UPDATE_ERROR,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			docsUrl: DocsLinks.UpdatePrepaidQuantity,
		});
	}

	const hasForbiddenField = FORBIDDEN_FIELDS.some(
		(key) => params[key] !== undefined,
	);

	if (hasForbiddenField) {
		throw new RecaseError({
			message:
				"A manual top-up can only change feature quantities; fields like customize, cancel_action, and billing_cycle_anchor are not allowed",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			docsUrl: DocsLinks.UpdatePrepaidQuantity,
		});
	}
};
