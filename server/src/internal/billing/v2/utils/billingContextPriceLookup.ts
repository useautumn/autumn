import {
	BillingInterval,
	cusProductsToPrices,
	type FixedPriceConfig,
	type Price,
	PriceType,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { BillingContext } from "@server/internal/billing/v2/billingContext";
import { getBillingType } from "@server/internal/products/prices/priceUtils";

/**
 * Looks up an Autumn price in billing context by Stripe price ID.
 *
 * When debugging Stripe subscription schedules or subscription updates, we often only have
 * Stripe price IDs. This function maps them back to Autumn prices for readable logs.
 *
 * Searches both `fullProducts` and `fullCustomer.customer_products` for full coverage,
 * since prices may exist in either location depending on context.
 */
export const billingContextLookupPriceByStripePriceId = ({
	stripePriceId,
	billingContext,
}: {
	stripePriceId: string;
	billingContext: BillingContext;
}): { price: Price; productName: string } | null => {
	// 1. Search in fullProducts
	for (const product of billingContext.fullProducts) {
		for (const price of product.prices) {
			if (
				price.config?.stripe_price_id === stripePriceId ||
				price.config?.stripe_empty_price_id === stripePriceId
			) {
				return { price, productName: product.name };
			}
		}
	}

	// 2. Search in fullCustomer.customer_products for broader coverage
	const customerProducts = billingContext.fullCustomer.customer_products ?? [];
	const customerPrices = cusProductsToPrices({ cusProducts: customerProducts });

	for (const price of customerPrices) {
		if (
			price.config?.stripe_price_id === stripePriceId ||
			price.config?.stripe_empty_price_id === stripePriceId
		) {
			// Find the product name from customer products
			const customerProduct = customerProducts.find((cp) =>
				cp.customer_prices.some((cusPrice) => cusPrice.price.id === price.id),
			);
			return {
				price,
				productName: customerProduct?.product.name ?? "Unknown Product",
			};
		}
	}

	return null;
};

/**
 * Formats interval for display (e.g., "month", "year", "one-off")
 */
const formatInterval = (interval: BillingInterval): string => {
	if (interval === BillingInterval.OneOff) return "one-off";
	return interval;
};

/**
 * Formats a price compactly for logging.
 * Format: <product_name> (<type>) [<price>/<interval>]
 * For usage prices with tiers: [<lowest> - <highest>/<interval>]
 */
const formatPriceCompact = ({
	price,
	productName,
}: {
	price: Price;
	productName: string;
}): string => {
	const config = price.config;

	if (config.type === PriceType.Fixed) {
		const fixedConfig = config as FixedPriceConfig;
		const interval = formatInterval(fixedConfig.interval);
		return `${productName} (fixed) [$${fixedConfig.amount}/${interval}]`;
	}

	const usageConfig = config as UsagePriceConfig;
	const billingType = getBillingType(usageConfig);
	const interval = formatInterval(usageConfig.interval);
	const featureId = usageConfig.feature_id ?? "unknown";

	// Determine type label
	const typeLabels: Record<string, string> = {
		usage_in_advance: "prepaid",
		usage_in_arrear: "usage",
		in_arrear_prorated: "allocated",
	};
	const typeLabel = typeLabels[billingType] ?? billingType;

	// Format price/tiers
	const tiers = usageConfig.usage_tiers;
	let priceDisplay: string;
	if (tiers.length === 1) {
		priceDisplay = `$${tiers[0].amount}`;
	} else {
		const amounts = tiers.map((t) => t.amount);
		const lowest = Math.min(...amounts);
		const highest = Math.max(...amounts);
		priceDisplay = `$${lowest}-$${highest}`;
	}

	return `${productName} (${typeLabel}) - ${featureId} [${priceDisplay}/${interval}]`;
};

/**
 * Formats an Autumn price for display by looking up the Stripe price ID in billing context.
 *
 * Used in logging functions to show human-readable price info instead of raw Stripe price IDs.
 * Falls back to displaying the Stripe price ID if no matching Autumn price is found.
 */
export const billingContextFormatPriceByStripePriceId = ({
	stripePriceId,
	billingContext,
}: {
	stripePriceId: string;
	billingContext: BillingContext;
}): string => {
	const autumnPriceInfo = billingContextLookupPriceByStripePriceId({
		stripePriceId,
		billingContext,
	});

	if (autumnPriceInfo) {
		return formatPriceCompact({
			price: autumnPriceInfo.price,
			productName: autumnPriceInfo.productName,
		});
	}

	return stripePriceId;
};
