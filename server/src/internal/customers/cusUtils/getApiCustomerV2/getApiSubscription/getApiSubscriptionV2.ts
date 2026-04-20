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
	type FullSubject,
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
	customerProduct,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
}) => {
	const planCtx = scopeExpandForCtx({
		ctx,
		prefix: "plan",
	});

	const shouldExpandPlanFromScopedCtx = expandPathIncludes({
		expand: ctx.expand,
		includes: ["plan"],
	});
	const shouldExpandPlanFromLegacyCtx = isCustomerProductOneOff(customerProduct)
		? expandIncludes({
				expand: ctx.expand,
				includes: [CustomerExpand.PurchasesPlan],
			})
		: expandIncludes({
				expand: ctx.expand,
				includes: [CustomerExpand.SubscriptionsPlan],
			});

	return {
		planCtx,
		shouldExpandPlan:
			shouldExpandPlanFromScopedCtx || shouldExpandPlanFromLegacyCtx,
	};
};

export const getApiSubscriptionV2 = async ({
	ctx,
	fullSubject,
	customerProduct,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
	customerProduct: FullCusProduct;
}): Promise<ApiSubscriptionResult> => {
	const fullProduct = cusProductToProduct({
		cusProduct: customerProduct,
	});
	const subId = customerProduct.subscription_ids?.[0];
	const autumnSubscription = fullSubject.subscriptions?.find(
		(subscription) =>
			subscription.id === subId ||
			(subscription as Subscription).stripe_id === subId,
	);

	let subscriptionPeriod = {
		current_period_start: null as number | null,
		current_period_end: null as number | null,
	};

	if (autumnSubscription) {
		subscriptionPeriod = {
			current_period_start: autumnSubscription.current_period_start
				? autumnSubscription.current_period_start * 1000
				: null,
			current_period_end: autumnSubscription.current_period_end
				? autumnSubscription.current_period_end * 1000
				: null,
		};
	}

	if (!subId && isCustomerProductTrialing(customerProduct)) {
		subscriptionPeriod = {
			current_period_start: customerProduct.starts_at,
			current_period_end: customerProduct.trial_ends_at ?? null,
		};
	}

	const { planCtx, shouldExpandPlan } = handlePlanExpand({
		ctx,
		customerProduct,
	});

	const apiPlan = shouldExpandPlan
		? await getPlanResponse({
				product: fullProduct,
				features: ctx.features,
				expand: planCtx.expand.filter((entry) => entry.length > 0),
			})
		: undefined;

	const status = cusProductToPlanStatus({
		status: customerProduct.status,
	});

	return {
		data: ApiSubscriptionV1Schema.parse({
			id: customerProduct.external_id ?? customerProduct.id ?? "",
			plan: apiPlan,
			plan_id: fullProduct.id,
			add_on: fullProduct.is_add_on,
			auto_enable: fullProduct.is_default,
			status: status === CusProductStatus.Active ? "active" : "scheduled",
			past_due: customerProduct.status === CusProductStatus.PastDue,
			canceled_at: customerProduct.canceled_at || null,
			expires_at: customerProduct.ended_at || null,
			trial_ends_at: isCustomerProductTrialing(customerProduct)
				? (customerProduct.trial_ends_at ?? null)
				: null,
			started_at: customerProduct.starts_at,
			quantity: customerProduct.quantity,
			current_period_start: subscriptionPeriod.current_period_start,
			current_period_end: subscriptionPeriod.current_period_end,
		} satisfies ApiSubscriptionV1),
		legacyData: {
			subscription_id: subId || undefined,
			options: customerProduct.options,
		} satisfies CusProductLegacyData,
	};
};
