import {
	type CreateScheduleBillingContext,
	ErrCode,
	type FullProduct,
	isFreeProduct,
	type Price,
	priceAmountsForCurrency,
	productToEffectivePrices,
} from "@autumn/shared";
import { setPlansError } from "../setPlansError";
import { requestedPlans } from "./requestedPlans";
import { stripeSubscriptionPlanName } from "./subscriptionScopeErrors";

const pricesInCurrency = ({
	fullProduct,
	currency,
}: {
	fullProduct: FullProduct;
	currency: string;
}): Price[] =>
	productToEffectivePrices({ product: fullProduct }).map((price) => {
		const { amount, usage_tiers } = priceAmountsForCurrency({
			config: price.config,
			currency,
		});
		return {
			...price,
			config: {
				...price.config,
				amount:
					amount ?? ("amount" in price.config ? price.config.amount : null),
				usage_tiers: usage_tiers ?? price.config.usage_tiers,
			},
		} as Price;
	});

/** Paid plans bill on the targeted subscription, so they must share its currency. */
export const assertTargetSubscriptionCurrency = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { stripeSubscriptionScope, stripeSubscription, currency } =
		billingContext;
	if (!stripeSubscriptionScope || !stripeSubscription || !currency) return;

	const requestsPaidPlan = requestedPlans({ billingContext }).some(
		({ fullProduct }) =>
			!isFreeProduct({ prices: pricesInCurrency({ fullProduct, currency }) }),
	);
	const subscriptionCurrency = stripeSubscription.currency.toLowerCase();
	const requestedCurrency = currency.toLowerCase();
	if (!requestsPaidPlan || subscriptionCurrency === requestedCurrency) {
		return;
	}

	throw setPlansError({
		code: ErrCode.CurrencyMismatch,
		details: {
			type: "currency_mismatch",
			subscription_plan_name: stripeSubscriptionPlanName({
				customerProducts: billingContext.fullCustomer.customer_products,
				stripeSubscriptionId: stripeSubscription.id,
			}),
			subscription_currency: subscriptionCurrency,
			requested_currency: requestedCurrency,
		},
	});
};
