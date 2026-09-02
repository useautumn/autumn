import {
	CusProductStatus,
	ErrCode,
	isCustomerProductOneOff,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

/**
 * Fields that change what the subscription bills for. A pause evaluates to a
 * single collection-only Stripe call (see `evaluateStripeBillingPlan`), so any
 * of these riding along would be silently dropped — reject the request instead.
 * Response-shaping fields (`expand`, `customer_data`, `proration_behavior`) are
 * unaffected and stay allowed.
 */
const FORBIDDEN_FIELDS: readonly (keyof UpdateSubscriptionV1Params)[] = [
	"feature_quantities",
	"license_quantities",
	"customize",
	"version",
	"cancel_action",
	"billing_cycle_anchor",
	"refund_last_payment",
	"recalculate_balances",
	"discounts",
	"status",
	"processor_subscription_id",
];

const PAUSABLE_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	// Re-pausing an already paused plan is allowed: it re-times `pause_until`.
	CusProductStatus.Paused,
];

export const handlePauseErrors = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}) => {
	const { pauseAction, customerProduct, stripeSubscription, intent } =
		billingContext;

	if (!pauseAction) return;

	const hasForbiddenField = FORBIDDEN_FIELDS.some(
		(key) => params[key] !== undefined,
	);

	if (hasForbiddenField || intent !== UpdateSubscriptionIntent.None) {
		throw new RecaseError({
			message:
				"pause_action must be the only update on the request; fields like customize, feature_quantities and cancel_action are not allowed alongside it",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (isCustomerProductOneOff(customerProduct)) {
		throw new RecaseError({
			message: `'${customerProduct.product.name}' is a one-off purchase and has no recurring billing to pause`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (pauseAction === "pause") {
		if (!PAUSABLE_STATUSES.includes(customerProduct.status)) {
			throw new RecaseError({
				message: `Subscription for '${customerProduct.product.name}' is ${customerProduct.status} and cannot be paused`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return;
	}

	// Resuming a plan Autumn never paused would clear a `pause_collection` the
	// org set in Stripe itself — allowed, since that is the only way back — but
	// a resume with nothing paused anywhere is a mistake.
	const isPausedInAutumn = customerProduct.status === CusProductStatus.Paused;
	const isPausedInStripe = Boolean(stripeSubscription?.pause_collection);

	if (!isPausedInAutumn && !isPausedInStripe) {
		throw new RecaseError({
			message: `Subscription for '${customerProduct.product.name}' is not paused`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
