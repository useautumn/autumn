import {
	type ApiSubscriptionV1,
	ApiSubscriptionV1Schema,
	type CusProductLegacyData,
	CusProductStatus,
	CustomerExpand,
	cusProductToPlanStatus,
	cusProductToProduct,
	expandIncludes,
	expandPathIncludes,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductOneOff,
	isCustomerProductTrialing,
	type Subscription,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { AutumnContext, RequestContext } from "@/honoUtils/HonoEnv.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

type ApiSubscriptionResult = {
	data: ApiSubscriptionV1;
	legacyData: CusProductLegacyData;
};

const handlePlanExpand = ({
	ctx,
	cusProduct,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
}): { planCtx: AutumnContext; shouldExpandPlan: boolean } => {
	const planCtx = scopeExpandForCtx({
		ctx,
		prefix: "plan",
	});

	// Check if we should expand the plan object.
	// Prefer scoped relative expand paths, but keep the legacy customer expand fallback.
	const shouldExpandPlanFromScopedCtx = expandPathIncludes({
		expand: ctx.expand,
		includes: ["plan"],
	});
	const shouldExpandPlanFromLegacyCtx = isCustomerProductOneOff(cusProduct)
		? expandIncludes({
				expand: ctx.expand,
				includes: [CustomerExpand.PurchasesPlan],
			})
		: expandIncludes({
				expand: ctx.expand,
				includes: [CustomerExpand.SubscriptionsPlan],
			});

	const shouldExpandPlan =
		shouldExpandPlanFromScopedCtx || shouldExpandPlanFromLegacyCtx;

	return { planCtx, shouldExpandPlan };
};

export const getApiSubscription = async ({
	ctx,
	fullCus,
	cusProduct,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
}): Promise<ApiSubscriptionResult> => {
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

	const { planCtx, shouldExpandPlan } = handlePlanExpand({ ctx, cusProduct });

	const apiPlan = shouldExpandPlan
		? await getPlanResponse({
				product: fullProduct,
				features: ctx.features,
				expand: planCtx.expand.filter((entry) => entry.length > 0),
			})
		: undefined;

	const apiSubscription = ApiSubscriptionV1Schema.parse({
		id: cusProduct.external_id ?? cusProduct.id ?? "",
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
	};
};
