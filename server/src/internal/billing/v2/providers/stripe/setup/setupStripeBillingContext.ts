import {
	type AttachParamsV1,
	type BillingContextOverride,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	isOneOffProduct,
	type MultiAttachParamsV0,
	notNullish,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeCustomerForBilling } from "./fetchStripeCustomerForBilling";
import { fetchStripeDiscountsForBilling } from "./fetchStripeDiscountsForBilling";
import { fetchStripeSubscriptionForBilling } from "./fetchStripeSubscriptionForBilling";
import { fetchStripeSubscriptionScheduleForBilling } from "./fetchStripeSubscriptionScheduleForBilling";

export const setupStripeBillingContext = async ({
	ctx,
	fullCustomer,
	product,
	targetCustomerProduct,
	contextOverride = {},
	params,
	newBillingSubscription,
	skipBillingChanges,
	skipSubscriptionFetching,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	product?: FullProduct;
	targetCustomerProduct?: FullCusProduct;
	contextOverride?: BillingContextOverride;
	params?: AttachParamsV1 | MultiAttachParamsV0 | UpdateSubscriptionV1Params;
	newBillingSubscription?: boolean;
	skipBillingChanges?: boolean;
	skipSubscriptionFetching?: boolean;
}) => {
	const { stripeBillingContext } = contextOverride;

	if (stripeBillingContext) return stripeBillingContext;

	if (skipBillingChanges) {
		return {
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			stripeCustomer: undefined,
			stripeDiscounts: undefined,
			paymentMethod: undefined,
			testClockFrozenTime: undefined,
		};
	}

	const {
		stripeCus: stripeCustomer,
		paymentMethod,
		testClockFrozenTime,
	} = await fetchStripeCustomerForBilling({
		ctx,
		fullCus: fullCustomer,
	});

	// If no target customer product, skip subscription/schedule fetching
	// Skip if product being attached is one off
	const attachingOneOff = product
		? isOneOffProduct({ prices: product.prices })
		: false;

	const stripeSubscription =
		attachingOneOff || skipSubscriptionFetching
			? undefined
			: await fetchStripeSubscriptionForBilling({
					ctx,
					fullCus: fullCustomer,
					product,
					targetCusProductId: targetCustomerProduct?.id,
					params,
					newBillingSubscription,
				});

	const stripeSubscriptionSchedule =
		targetCustomerProduct || notNullish(stripeSubscription)
			? await fetchStripeSubscriptionScheduleForBilling({
					ctx,
					fullCus: fullCustomer,
					subscriptionScheduleId:
						typeof stripeSubscription?.schedule === "string"
							? stripeSubscription.schedule
							: undefined,
					products: [],
					targetCusProductId: targetCustomerProduct?.id,
				})
			: undefined;

	const stripeDiscounts = await fetchStripeDiscountsForBilling({
		ctx,
		stripeSubscription,
		stripeCustomer,
		paramDiscounts:
			params && "discounts" in params ? params.discounts : undefined,
	});

	return {
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeCustomer,
		stripeDiscounts,
		paymentMethod,
		testClockFrozenTime,
	};
};
