import {
	type ApiPlanItemV1,
	FixedPriceConfigSchema,
	type Feature,
	type FullProduct,
	getProductItemDisplay,
	isFeaturePriceItem,
	isFixedPrice,
	itemToBillingInterval,
	itemToBillingIntervalCount,
	itemToBillingMethod,
	matchesPlanItemFilter,
	type PlanItemFilter,
	type Price,
	type ProductItem,
	productItemsToPlanItemsV1,
	productV2ToBasePrice,
	productV2ToFeatureItems,
	sortProductItems,
	UsagePriceConfigSchema,
} from "@autumn/shared";
import type {
	CatalogStripeMapping,
	CatalogStripeProduct,
} from "@autumn/shared/api/catalog/catalogMappingModels.js";
import type Stripe from "stripe";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";

export type ProductMappingContext = {
	product: FullProduct;
	basePrice?: Price;
	itemPrices: Array<{
		price: Price;
		item: ProductItem;
		apiItem: ApiPlanItemV1;
		itemFilter: PlanItemFilter;
		label: string;
	}>;
};

export const stripeProductToCatalogProduct = (
	product: Stripe.Product,
): CatalogStripeProduct => ({
	id: product.id,
	name: product.name ?? null,
	active: product.active,
});

export const buildStripeMapping = ({
	stripeProductId,
	stripeProductsById,
	stripeConnected,
	deferred = true,
}: {
	stripeProductId: string | null | undefined;
	stripeProductsById: Map<string, CatalogStripeProduct>;
	stripeConnected: boolean;
	// When true, skip resolving against Stripe and return `unchecked` for mapped
	// ids so the client can resolve names/status lazily.
	deferred?: boolean;
}): CatalogStripeMapping => {
	if (!stripeProductId) {
		return {
			stripe_product_id: null,
			stripe_product: null,
			status: "unmapped",
		};
	}

	if (deferred || !stripeConnected) {
		return {
			stripe_product_id: stripeProductId,
			stripe_product: null,
			status: "unchecked",
		};
	}

	const stripeProduct = stripeProductsById.get(stripeProductId) ?? null;
	if (!stripeProduct) {
		return {
			stripe_product_id: stripeProductId,
			stripe_product: null,
			status: "missing",
		};
	}

	return {
		stripe_product_id: stripeProductId,
		stripe_product: stripeProduct,
		status: stripeProduct.active ? "ok" : "inactive",
	};
};

const itemToMaxFilter = (item: ProductItem): PlanItemFilter => ({
	feature_id: item.feature_id!,
	billing_method: itemToBillingMethod({ item }),
	interval: itemToBillingInterval({ item }),
	interval_count: itemToBillingIntervalCount({ item }),
});

const filterKey = (filter: PlanItemFilter) => JSON.stringify(filter);

export const itemToCanonicalFilter = ({
	item,
	allItems,
}: {
	item: ProductItem;
	allItems: ProductItem[];
}): PlanItemFilter => {
	const billing_method = itemToBillingMethod({ item });
	const candidates: PlanItemFilter[] = [
		{ feature_id: item.feature_id! },
		{
			feature_id: item.feature_id!,
			billing_method,
		},
		{
			feature_id: item.feature_id!,
			billing_method,
			interval: itemToBillingInterval({ item }),
		},
		{
			feature_id: item.feature_id!,
			billing_method,
			interval: itemToBillingInterval({ item }),
			interval_count: itemToBillingIntervalCount({ item }),
		},
	];
	const itemMaxFilterKey = filterKey(itemToMaxFilter(item));

	return (
		candidates.find((filter) => {
			const matchingMaxFilterKeys = new Set(
				allItems
					.filter((candidate) =>
						matchesPlanItemFilter({ item: candidate, filter }),
					)
					.map((candidate) => filterKey(itemToMaxFilter(candidate))),
			);

			return (
				matchingMaxFilterKeys.size === 1 &&
				matchingMaxFilterKeys.has(itemMaxFilterKey)
			);
		}) ?? candidates[candidates.length - 1]!
	);
};

export const buildProductMappingContext = ({
	product,
	features,
	currency,
}: {
	product: FullProduct;
	features: Feature[];
	currency: string;
}): ProductMappingContext => {
	const rawItems = mapToProductItems({
		prices: product.prices,
		entitlements: product.entitlements,
		features,
	});
	const sortedItems = sortProductItems(rawItems, features);
	const basePriceItem = productV2ToBasePrice({
		product: { items: sortedItems } as any,
	});
	const basePrice = basePriceItem?.price_id
		? product.prices.find((price) => price.id === basePriceItem.price_id)
		: undefined;

	const featureItems = productV2ToFeatureItems({
		items: sortedItems,
		withBasePrice: false,
	});
	const itemPrices = featureItems
		.filter((item) => item.price_id && isFeaturePriceItem(item))
		.map((item) => {
			const price = product.prices.find((p) => p.id === item.price_id);
			const apiItem = productItemsToPlanItemsV1({
				items: [item],
				features,
				currency,
			}).map((entry) => ({ ...entry, proration: undefined }))[0];

			if (!price || !apiItem) return null;

			return {
				price,
				item,
				apiItem,
				itemFilter: itemToCanonicalFilter({ item, allItems: featureItems }),
				label:
					getProductItemDisplay({ item, features, currency }).primary_text ??
					item.feature_id ??
					"Item price",
			};
		})
		.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

	return {
		product,
		basePrice,
		itemPrices,
	};
};

export const clearDependentStripePriceFields = ({
	price,
	stripeProductId,
	stripePriceId,
	stripeMeterId,
}: {
	price: Price;
	stripeProductId: string | null;
	stripePriceId?: string | null;
	stripeMeterId?: string | null;
}): Price["config"] => {
	if (isFixedPrice(price)) {
		const config = FixedPriceConfigSchema.parse(price.config);
		return {
			...config,
			stripe_product_id: stripeProductId,
			stripe_price_id: stripePriceId ?? null,
			stripe_empty_price_id: null,
		};
	}

	const config = UsagePriceConfigSchema.parse(price.config);
	return {
		...config,
		stripe_product_id: stripeProductId,
		stripe_price_id: stripePriceId ?? null,
		stripe_empty_price_id: null,
		stripe_placeholder_price_id: null,
		stripe_prepaid_price_v2_id: null,
		stripe_meter_id: stripeMeterId ?? null,
		stripe_event_name: null,
	};
};

export const productHasStripeProductId = ({
	product,
	stripeProductId,
}: {
	product: FullProduct;
	stripeProductId: string;
}) =>
	product.processor?.id === stripeProductId ||
	product.prices.some(
		(price) => price.config.stripe_product_id === stripeProductId,
	);
