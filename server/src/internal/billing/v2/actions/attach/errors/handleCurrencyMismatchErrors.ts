import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isFreeProduct,
	notNullish,
	orgToCurrency,
	type Price,
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
}): boolean => {
	const base = (price.config.base_currency ?? orgDefault).toLowerCase();
	if (base === currency) return true;
	return notNullish(price.config.currencies?.[currency]);
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

	const orgDefault = orgToCurrency({ org: ctx.org }).toLowerCase();
	const locked = fullCustomer.currency?.toLowerCase() || null;
	const requested = params.currency?.toLowerCase() || null;
	const resolved =
		billingContext.currency ??
		resolveCustomerCurrency({
			customer: fullCustomer,
			org: ctx.org,
			requested: params.currency,
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
	const planMissesCurrency = prices
		.filter(priceCharges)
		.some(
			(price) =>
				!priceOffersCurrency({ price, currency: resolved, orgDefault }),
		);

	if (planMissesCurrency) {
		throw new RecaseError({
			code: ErrCode.CurrencyMismatch,
			message: `Plan '${attachProduct.name}' does not offer a price in ${resolved.toUpperCase()}`,
			statusCode: 400,
		});
	}
};
