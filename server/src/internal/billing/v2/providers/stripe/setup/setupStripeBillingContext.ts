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
import { all } from "better-all";
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
	skipBillingFetching,
	skipSubscriptionFetching,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	product?: FullProduct;
	targetCustomerProduct?: FullCusProduct;
	contextOverride?: BillingContextOverride;
	params?: AttachParamsV1 | MultiAttachParamsV0 | UpdateSubscriptionV1Params;
	newBillingSubscription?: boolean;
	skipBillingFetching?: boolean;
	skipSubscriptionFetching?: boolean;
}) => {
	const { stripeBillingContext } = contextOverride;

	if (stripeBillingContext) return stripeBillingContext;

	if (skipBillingFetching) {
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
		stripeContext: {
			stripeCus: stripeCustomer,
			paymentMethod,
			testClockFrozenTime,
		},
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeDiscounts,
	} = await all({
		async stripeContext() {
			return fetchStripeCustomerForBilling({
				ctx,
				fullCus: fullCustomer,
			});
		},
		async stripeSubscription() {
			// If no target customer product, skip subscription/schedule fetching
			// Skip if product being attached is one off
			const attachingOneOff = product
				? isOneOffProduct({ prices: product.prices })
				: false;

			return attachingOneOff || skipSubscriptionFetching
				? undefined
				: fetchStripeSubscriptionForBilling({
						ctx,
						fullCus: fullCustomer,
						product,
						targetCusProductId: targetCustomerProduct?.id,
						params,
						newBillingSubscription,
					});
		},
		async stripeSubscriptionSchedule() {
			const localStripeSubscription = await this.$.stripeSubscription;

			return targetCustomerProduct || notNullish(localStripeSubscription)
				? fetchStripeSubscriptionScheduleForBilling({
						ctx,
						fullCus: fullCustomer,
						subscriptionScheduleId:
							typeof localStripeSubscription?.schedule === "string"
								? localStripeSubscription.schedule
								: undefined,
						products: [],
						targetCusProductId: targetCustomerProduct?.id,
					})
				: undefined;
		},
		async stripeDiscounts() {
			const localStripeCustomer = (await this.$.stripeContext).stripeCus;
			const localStripeSubscription = await this.$.stripeSubscription;

			return fetchStripeDiscountsForBilling({
				ctx,
				stripeSubscription: localStripeSubscription,
				stripeCustomer: localStripeCustomer,
				paramDiscounts:
					params && "discounts" in params ? params.discounts : undefined,
			});
		},
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
