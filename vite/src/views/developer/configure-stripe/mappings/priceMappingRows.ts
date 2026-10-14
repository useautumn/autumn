import {
	type Feature,
	getProductItemDisplay,
	isFeaturePriceItem,
	type ProductItem,
	type ProductV2,
	productV2ToBasePrice,
} from "@autumn/shared";

export type PriceMappingRow = {
	priceId: string;
	planId: string;
	planName: string;
	version: number;
	label: string;
	stripeProductId: string | null;
	stripePriceId: string | null;
};

export type PriceMappingGroup = {
	planId: string;
	planName: string;
	rows: PriceMappingRow[];
};

const itemStripePriceId = ({ item }: { item: ProductItem }): string | null =>
	item.price_config?.stripe_prepaid_price_v2_id ??
	item.price_config?.stripe_price_id ??
	null;

const itemToPriceMappingRow = ({
	product,
	item,
	features,
}: {
	product: ProductV2;
	item: ProductItem;
	features: Feature[];
}): PriceMappingRow | null => {
	if (!item.price_id) return null;
	const display = getProductItemDisplay({ item, features });

	return {
		priceId: item.price_id,
		planId: product.id,
		planName: product.name,
		version: product.version,
		label: [display.primary_text, display.secondary_text]
			.filter(Boolean)
			.join(" "),
		stripeProductId: item.price_config?.stripe_product_id ?? null,
		stripePriceId: itemStripePriceId({ item }),
	};
};

const byNewestVersion = (a: PriceMappingRow, b: PriceMappingRow) =>
	b.version - a.version;

export const basePriceMappingRows = ({
	products,
	planIds,
	features,
}: {
	products: ProductV2[];
	planIds: string[];
	features: Feature[];
}): PriceMappingRow[] =>
	products
		.filter((product) => planIds.includes(product.id))
		.flatMap((product) => {
			const item = productV2ToBasePrice({ product });
			const row = item
				? itemToPriceMappingRow({ product, item, features })
				: null;
			return row ? [row] : [];
		})
		.sort(byNewestVersion);

export const featurePriceMappingRows = ({
	products,
	featureId,
	features,
}: {
	products: ProductV2[];
	featureId: string;
	features: Feature[];
}): PriceMappingRow[] =>
	products
		.flatMap((product) =>
			product.items
				.filter(
					(item) => item.feature_id === featureId && isFeaturePriceItem(item),
				)
				.flatMap((item) => {
					const row = itemToPriceMappingRow({ product, item, features });
					return row ? [row] : [];
				}),
		)
		.sort(byNewestVersion);

export const groupRowsByPlan = ({
	rows,
}: {
	rows: PriceMappingRow[];
}): PriceMappingGroup[] => {
	const groups = new Map<string, PriceMappingGroup>();
	for (const row of rows) {
		const group = groups.get(row.planId) ?? {
			planId: row.planId,
			planName: row.planName,
			rows: [],
		};
		group.rows.push(row);
		groups.set(row.planId, group);
	}
	return [...groups.values()];
};

export const pricedFeatures = ({
	products,
	features,
}: {
	products: ProductV2[];
	features: Feature[];
}): Feature[] => {
	const pricedFeatureIds = new Set(
		products.flatMap((product) =>
			product.items
				.filter((item) => isFeaturePriceItem(item) && item.feature_id)
				.map((item) => item.feature_id as string),
		),
	);
	return features.filter(
		(feature) => pricedFeatureIds.has(feature.id) && !feature.archived,
	);
};

export const rowUsesAnotherProduct = ({
	row,
	defaultStripeProductId,
}: {
	row: PriceMappingRow;
	defaultStripeProductId: string | null;
}) =>
	Boolean(row.stripeProductId) &&
	row.stripeProductId !== defaultStripeProductId;

export const featureStripeProductIds = ({
	rows,
	defaultStripeProductId,
}: {
	rows: PriceMappingRow[];
	defaultStripeProductId: string | null;
}) => [
	...new Set(
		[defaultStripeProductId, ...rows.map((row) => row.stripeProductId)].filter(
			(id): id is string => Boolean(id),
		),
	),
];
