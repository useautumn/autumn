import {
	type ApiPlanV1,
	type ApiSubscriptionV1,
	ApiSubscriptionV1Schema,
	type CusProductLegacyData,
	CusProductStatus,
	CustomerExpand,
	cusProductToPlanStatus,
	cusProductToProduct,
	expandIncludes,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductOneOff,
	isCustomerProductTrialing,
	type Subscription,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

type SubscriptionExpandParams = { plan?: boolean };

type ApiSubscriptionResult<T extends SubscriptionExpandParams> = {
	data: T["plan"] extends true
		? ApiSubscriptionV1 & { plan: ApiPlanV1 }
		: ApiSubscriptionV1;
	legacyData: CusProductLegacyData;
};

export const getApiSubscription = async <
	// biome-ignore lint/complexity/noBannedTypes: required for type inference
	T extends SubscriptionExpandParams = {},
>({
	ctx,
	fullCus,
	cusProduct,
	expandParams,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	expandParams?: T;
}): Promise<ApiSubscriptionResult<T>> => {
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
	// Use expandParams.plan if provided, otherwise fall back to ctx.expand
	const shouldExpandPlan =
		expandParams?.plan ??
		(isCustomerProductOneOff(cusProduct)
			? expandIncludes({
					expand: ctx.expand,
					includes: [CustomerExpand.PurchasesPlan],
				})
			: expandIncludes({
					expand: ctx.expand,
					includes: [CustomerExpand.SubscriptionsPlan],
				}));

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

		status: status === CusProductStatus.Active ? "active" : "scheduled",
		past_due: cusProduct.status === CusProductStatus.PastDue,
		canceled_at: cusProduct.canceled_at || null,
		expires_at: cusProduct.ended_at || null,

		trial_ends_at: isCustomerProductTrialing(cusProduct)
			? (cusProduct.trial_ends_at ?? null)
			: null,
		started_at: cusProduct.starts_at,
		quantity: cusProduct.quantity,
		current_period_start: stripeSubData?.current_period_start || null,
		current_period_end: stripeSubData?.current_period_end || null,
	} satisfies ApiSubscriptionV1);

	return {
		data: apiSubscription,
		legacyData: {
			subscription_id: subId || undefined,
			options: cusProduct.options,
		} satisfies CusProductLegacyData,
	} as ApiSubscriptionResult<T>;
};
