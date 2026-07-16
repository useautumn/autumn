import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isFixedPrice,
	isFreeProduct,
	notNullish,
	orgMultiCurrencyEnabled,
	orgToCurrency,
	type Price,
	priceHasCurrencyAmounts,
	productToEffectivePrices,
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

export const planOffersCurrency = ({
	ctx,
	prices,
	currency,
}: {
	ctx: AutumnContext;
	prices: Price[];
	currency: string;
}): boolean => {
	if (isFreeProduct({ prices })) return true;

	const orgDefault = orgToCurrency({ org: ctx.org }).toLowerCase();
	return !prices
		.filter(priceCharges)
		.some((price) => !priceOffersCurrency({ price, currency, orgDefault }));
};

export const assertPlanOffersCurrency = ({
	ctx,
	prices,
	planName,
	currency,
	customerConfigured = false,
}: {
	ctx: AutumnContext;
	prices: Price[];
	planName: string;
	currency: string;
	customerConfigured?: boolean;
}) => {
	if (!planOffersCurrency({ ctx, prices, currency })) {
		const code = currency.toUpperCase();
		throw new RecaseError({
			code: ErrCode.CurrencyMismatch,
			message: customerConfigured
				? `This customer pays in ${code}, but plan '${planName}' has no ${code} price. Add ${code} pricing to the plan or pick a plan that offers it.`
				: `Plan '${planName}' does not offer a price in ${code}. Add ${code} pricing to the plan or bill in a currency it supports.`,
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
	const prices = productToEffectivePrices({ product: attachProduct });

	if (params.currency && !orgMultiCurrencyEnabled({ org: ctx.org })) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "Multi-currency is not enabled for this organization",
			statusCode: 400,
		});
	}

	// Free / auto-enabled plans neither need nor lock a currency.
	if (isFreeProduct({ product: attachProduct })) return;

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
		customerConfigured: !!locked && resolved === locked,
	});
};
