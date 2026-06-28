import {
	type Feature,
	type FullProduct,
	type ApiPlanItemV1,
	type PlanItemFilter,
	type Price,
	type ProductItem,
	UsageModel,
	getProductItemDisplay,
	itemToBillingInterval,
	itemToBillingIntervalCount,
	productItemsToPlanItemsV1,
	productV2ToBasePrice,
	productV2ToFeatureItems,
	sortProductItems,
} from "@autumn/shared";
import type {
	CatalogStripeMapping,
	CatalogStripeProduct,
} from "@autumn/shared/api/catalog/catalogMappingModels.js";
import { BillingMethod } from "@autumn/shared/api/products/components/billingMethod.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { isPriceItem } from "@utils/productV2Utils/productItemUtils/getItemType.js";
import { matchesPlanItemFilter } from "@utils/productV2Utils/productItemUtils/matchPlanItem.js";
import type Stripe from "stripe";

export const dependentStripePriceFields = [
	"stripe_price_id",
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
	"stripe_prepaid_price_v2_id",
	"stripe_meter_id",
	"stripe_event_name",
] as const;

export type PriceConfigWithStripe = Price["config"] & {
	stripe_product_id?: string | null;
	stripe_price_id?: string | null;
	stripe_empty_price_id?: string | null;
	stripe_placeholder_price_id?: string | null;
	stripe_prepaid_price_v2_id?: string | null;
	stripe_meter_id?: string | null;
	stripe_event_name?: string | null;
};

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
}: {
	stripeProductId: string | null | undefined;
	stripeProductsById: Map<string, CatalogStripeProduct>;
	stripeConnected: boolean;
}): CatalogStripeMapping => {
	if (!stripeProductId) {
		return {
			stripe_product_id: null,
			stripe_product: null,
			status: "unmapped",
		};
	}

	if (!stripeConnected) {
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

const itemToCanonicalFilter = ({
	item,
	allItems,
}: {
	item: ProductItem;
	allItems: ProductItem[];
}): PlanItemFilter => {
	const billing_method =
		item.usage_model === UsageModel.PayPerUse
			? BillingMethod.UsageBased
			: BillingMethod.Prepaid;
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

	return (
		candidates.find(
			(filter) =>
				allItems.filter((candidate) =>
					matchesPlanItemFilter({ item: candidate, filter }),
				).length === 1,
		) ?? candidates[candidates.length - 1]!
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
		.filter((item) => item.price_id && !isPriceItem(item))
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
	config,
	stripeProductId,
}: {
	config: PriceConfigWithStripe;
	stripeProductId: string | null;
}): PriceConfigWithStripe => {
	const nextConfig: PriceConfigWithStripe = {
		...config,
		stripe_product_id: stripeProductId,
	};

	for (const field of dependentStripePriceFields) {
		nextConfig[field] = null;
	}

	return nextConfig;
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
		(price) =>
			(price.config as PriceConfigWithStripe).stripe_product_id ===
			stripeProductId,
	);
