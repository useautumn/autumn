import {
	BillingInterval,
	cusProductsToPrices,
	type FixedPriceConfig,
	type Price,
	PriceType,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { BillingContext } from "@autumn/shared";
import { getBillingType } from "@server/internal/products/prices/priceUtils";

const billingContextLookupPriceByStripePriceId = ({
	stripePriceId,
	billingContext,
}: {
	stripePriceId: string;
	billingContext: BillingContext;
}): { price: Price; productName: string } | null => {
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

	const customerProducts = billingContext.fullCustomer.customer_products ?? [];
	const customerPrices = cusProductsToPrices({ cusProducts: customerProducts });

	for (const price of customerPrices) {
		if (
			price.config?.stripe_price_id === stripePriceId ||
			price.config?.stripe_empty_price_id === stripePriceId
		) {
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

const formatInterval = (interval: BillingInterval): string => {
	if (interval === BillingInterval.OneOff) return "one-off";
	return interval;
};

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

	const typeLabels: Record<string, string> = {
		usage_in_advance: "prepaid",
		usage_in_arrear: "usage",
		in_arrear_prorated: "allocated",
	};
	const typeLabel = typeLabels[billingType] ?? billingType;

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
