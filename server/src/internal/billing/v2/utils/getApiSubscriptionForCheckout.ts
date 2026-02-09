import {
	type BillingContext,
	type CheckoutSubscription,
	CusExpand,
	CusProductStatus,
	cusProductToPlanStatus,
	cusProductToProduct,
	type FullCusProduct,
	isCustomerProductTrialing,
	orgToCurrency,
	secondsToMs,
} from "@autumn/shared";
import {
	getEarliestPeriodStart,
	getLatestPeriodEnd,
} from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

/**
 * Build an ApiSubscription with plan always included (for checkout display).
 * Unlike getApiSubscription which uses ctx.expand, this always includes the plan.
 */
export const getApiSubscriptionForCheckout = async ({
	ctx,
	cusProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
	billingContext: BillingContext;
}): Promise<CheckoutSubscription> => {
	const fullProduct = cusProductToProduct({ cusProduct });
	const { fullCustomer, stripeSubscription } = billingContext;
	const currency = orgToCurrency({ org: ctx.org });

	// Always get plan for checkout (with features expanded for display)
	const plan = await getPlanResponse({
		product: fullProduct,
		features: ctx.features,
		fullCus: fullCustomer,
		currency,
		expand: [CusExpand.PlanFeaturesFeature],
	});

	const status = cusProductToPlanStatus({ status: cusProduct.status });

	// Get subscription period from Stripe subscription if available
	let periodStart: number | null = null;
	let periodEnd: number | null = null;

	if (stripeSubscription) {
		periodStart =
			secondsToMs(getEarliestPeriodStart({ sub: stripeSubscription })) ?? null;
		periodEnd =
			secondsToMs(getLatestPeriodEnd({ sub: stripeSubscription })) ?? null;
	} else if (
		cusProduct.trial_ends_at &&
		cusProduct.trial_ends_at > Date.now()
	) {
		periodStart = cusProduct.starts_at;
		periodEnd = cusProduct.trial_ends_at;
	}

	return {
		plan,
		plan_id: fullProduct.id,
		add_on: fullProduct.is_add_on,
		default: fullProduct.is_default,

		status,
		past_due: cusProduct.status === CusProductStatus.PastDue,
		canceled_at: cusProduct.canceled_at || null,
		expires_at: cusProduct.ended_at || null,

		trial_ends_at: isCustomerProductTrialing(cusProduct)
			? (cusProduct.trial_ends_at ?? null)
			: null,
		started_at: cusProduct.starts_at,
		quantity: cusProduct.quantity,
		current_period_start: periodStart,
		current_period_end: periodEnd,
	};
};
