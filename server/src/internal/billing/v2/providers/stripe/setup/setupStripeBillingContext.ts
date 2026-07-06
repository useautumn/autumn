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
import type Stripe from "stripe";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeCustomerForBilling } from "./fetchStripeCustomerForBilling";
import { fetchStripeDiscountsForBilling } from "./fetchStripeDiscountsForBilling";
import { fetchStripeSubscriptionForBilling } from "./fetchStripeSubscriptionForBilling";
import { fetchStripeSubscriptionScheduleForBilling } from "./fetchStripeSubscriptionScheduleForBilling";
import { fetchStripeTaxRateForBilling } from "./fetchStripeTaxRateForBilling";

const getScheduleSubscriptionId = (
	stripeSubscriptionSchedule: Stripe.SubscriptionSchedule | undefined,
) => {
	const subscription = stripeSubscriptionSchedule?.subscription;
	return typeof subscription === "string" ? subscription : subscription?.id;
};

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
	fetchScheduledCustomerProductSchedule = false,
	createStripeCustomerIfMissing = true,
	fetchTaxRate = false,
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
	fetchScheduledCustomerProductSchedule?: boolean;
	createStripeCustomerIfMissing?: boolean;
	fetchTaxRate?: boolean;
}) => {
	const { stripeBillingContext } = contextOverride;

	if (stripeBillingContext) return stripeBillingContext;

	if (skipBillingFetching) {
		return {
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			stripeCustomer: undefined,
			stripeDiscounts: undefined,
			stripeTaxRate: undefined,
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
		stripeTaxRate,
	} = await all({
		async stripeContext() {
			return fetchStripeCustomerForBilling({
				ctx,
				fullCus: fullCustomer,
				createIfMissing: createStripeCustomerIfMissing,
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

			return targetCustomerProduct ||
				notNullish(localStripeSubscription) ||
				fetchScheduledCustomerProductSchedule
				? fetchStripeSubscriptionScheduleForBilling({
						ctx,
						fullCus: fullCustomer,
						subscriptionScheduleId: stripeSubscriptionToScheduleId({
							stripeSubscription: localStripeSubscription,
						}),
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
		async stripeTaxRate() {
			if (!fetchTaxRate) return undefined;
			const taxRateId =
				params && "tax_rate_id" in params ? params.tax_rate_id : undefined;
			return fetchStripeTaxRateForBilling({ ctx, taxRateId });
		},
	});

	const stripeSubscriptionScheduleForContext =
		stripeSubscription && stripeSubscriptionSchedule
			? getScheduleSubscriptionId(stripeSubscriptionSchedule) ===
				stripeSubscription.id
				? stripeSubscriptionSchedule
				: undefined
			: stripeSubscriptionSchedule;

	return {
		stripeSubscription,
		stripeSubscriptionSchedule: stripeSubscriptionScheduleForContext,
		stripeCustomer,
		stripeDiscounts,
		stripeTaxRate,
		paymentMethod,
		testClockFrozenTime,
	};
};
