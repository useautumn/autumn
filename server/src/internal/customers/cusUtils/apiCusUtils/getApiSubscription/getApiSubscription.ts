import {
	ApiSubscriptionV1Schema,
	CusExpand,
	type CusProductLegacyData,
	CusProductStatus,
	cusProductToPlanStatus,
	cusProductToProduct,
	expandIncludes,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductTrialing,
	type Subscription,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

export const getApiSubscription = async ({
	ctx,
	fullCus,
	cusProduct,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
}) => {
	const trialing =
		cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();

	const fullProduct = cusProductToProduct({ cusProduct });

	const subId = cusProduct.subscription_ids?.[0];
	const autumnSub = fullCus.subscriptions?.find(
		(s) => s.id === subId || (s as Subscription).stripe_id === subId,
	);

	let stripeSubData: {
		current_period_start: number | null;
		current_period_end: number | null;
	} = {
		current_period_start: null,
		current_period_end: null,
	};

	if (autumnSub) {
		stripeSubData = {
			current_period_end: autumnSub?.current_period_end
				? autumnSub.current_period_end * 1000
				: null,
			current_period_start: autumnSub?.current_period_start
				? autumnSub.current_period_start * 1000
				: null,
		};
	}

	if (!subId && trialing) {
		stripeSubData = {
			current_period_start: cusProduct.starts_at,
			current_period_end: cusProduct.trial_ends_at || null,
		};
	}

	const status = cusProductToPlanStatus({ status: cusProduct.status });

	// Check if we should expand the plan object

	const shouldExpandPlan =
		status === "scheduled"
			? expandIncludes({
					expand: ctx.expand,
					includes: [CusExpand.ScheduledSubscriptionsPlan],
				})
			: expandIncludes({
					expand: ctx.expand,
					includes: [CusExpand.SubscriptionsPlan],
				});

	const apiPlan = shouldExpandPlan
		? await getPlanResponse({
				product: fullProduct,
				features: ctx.features,
			})
		: undefined;

	const apiSubscription = ApiSubscriptionV1Schema.parse({
		plan: apiPlan,

		plan_id: fullProduct.id,
		add_on: fullProduct.is_add_on,
		auto_enable: fullProduct.is_default,

		status,
		past_due: cusProduct.status === CusProductStatus.PastDue,
		canceled_at: cusProduct.canceled_at || null,
		expires_at: cusProduct.ended_at || null,

		trial_ends_at: isCustomerProductTrialing(cusProduct)
			? cusProduct.trial_ends_at
			: null,
		started_at: cusProduct.starts_at,
		quantity: cusProduct.quantity,
		current_period_start: stripeSubData?.current_period_start || null,
		current_period_end: stripeSubData?.current_period_end || null,
	});

	return {
		data: apiSubscription,
		legacyData: {
			subscription_id: subId || undefined,
			options: cusProduct.options,
			// features: ctx.features,
		} satisfies CusProductLegacyData,
	};
};
