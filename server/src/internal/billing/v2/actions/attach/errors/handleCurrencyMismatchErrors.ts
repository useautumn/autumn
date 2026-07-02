import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isFixedPrice,
	isFreeProduct,
	notNullish,
	orgToCurrency,
	type Price,
	priceHasCurrencyAmounts,
	RecaseError,
	resolveCustomerCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const priceCharges = (price: Price): boolean => {
	const config = price.config;
	if ("usage_tiers" in config && notNullish(config.usage_tiers)) {
		return config.usage_tiers.some(
			(tier) => tier.amount + (tier.flat_amount ?? 0) > 0,
		);
	}
	if ("amount" in config && notNullish(config.amount)) {
		return (config.amount ?? 0) > 0;
	}
	return false;
};

const priceOffersCurrency = ({
	price,
	currency,
	orgDefault,
}: {
	price: Price;
	currency: string;
	orgDefault: string;
}): boolean =>
	priceHasCurrencyAmounts({
		config: price.config,
		currency,
		orgDefault,
		isFixed: isFixedPrice(price),
	});

export const assertPlanOffersCurrency = ({
	ctx,
	prices,
	planName,
	currency,
}: {
	ctx: AutumnContext;
	prices: Price[];
	planName: string;
	currency: string;
}) => {
	if (isFreeProduct({ prices })) return;

	const orgDefault = orgToCurrency({ org: ctx.org }).toLowerCase();
	const planMissesCurrency = prices
		.filter(priceCharges)
		.some((price) => !priceOffersCurrency({ price, currency, orgDefault }));

	if (planMissesCurrency) {
		throw new RecaseError({
			code: ErrCode.CurrencyMismatch,
			message: `Plan '${planName}' does not offer a price in ${currency.toUpperCase()}`,
			statusCode: 400,
		});
	}
};

/**
 * Blocks an attach that would bill the customer in an unsupported currency.
 * Runs pre-Stripe (before evaluateStripeBillingPlan, which creates Stripe prices).
 */
export const handleCurrencyMismatchErrors = ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	const { fullCustomer, attachProduct } = billingContext;
	const prices = attachProduct.prices;

	// Free / auto-enabled plans neither need nor lock a currency.
	if (isFreeProduct({ prices })) return;

	const locked =
		(
			fullCustomer.currency ?? billingContext.stripeCustomer?.currency
		)?.toLowerCase() || null;
	const requested = params.currency?.toLowerCase() || null;
	const resolved =
		billingContext.currency ??
		resolveCustomerCurrency({
			customer: fullCustomer,
			org: ctx.org,
			requested: params.currency,
			stripeCurrency: billingContext.stripeCustomer?.currency,
		});

	// A locked customer cannot switch currencies (Stripe forbids it anyway).
	if (locked && requested && requested !== locked) {
		throw new RecaseError({
			code: ErrCode.CurrencyMismatch,
			message: `Customer is locked to ${locked.toUpperCase()} and cannot be billed in ${requested.toUpperCase()}`,
			statusCode: 400,
		});
	}

	// Every charging price must offer the resolved currency (no FX fallback).
	assertPlanOffersCurrency({
		ctx,
		prices,
		planName: attachProduct.name,
		currency: resolved,
	});
};
