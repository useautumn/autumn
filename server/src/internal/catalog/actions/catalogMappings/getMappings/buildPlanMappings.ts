import {
	type CatalogStripeProduct,
	type Feature,
	type FullProduct,
	ProcessorType,
} from "@autumn/shared";
import {
	buildProductMappingContext,
	buildStripeMapping,
	itemToCanonicalFilter,
} from "../catalogMappingUtils.js";

const mappingConflict = () => ({
	stripe_product_id: null,
	stripe_product: null,
	status: "conflict" as const,
});

const filterKey = (filter: unknown) => JSON.stringify(filter);

const getPlanFamilyProducts = ({
	product,
	allProducts,
}: {
	product: FullProduct;
	allProducts: FullProduct[];
}) => {
	const planVersions = allProducts.filter(
		(candidate) => candidate.id === product.id,
	);
	if (product.base_internal_product_id) return planVersions;

	const baseInternalIds = new Set(
		planVersions.map((candidate) => candidate.internal_id),
	);
	const variantVersions = allProducts.filter(
		(candidate) =>
			candidate.base_internal_product_id &&
			baseInternalIds.has(candidate.base_internal_product_id),
	);

	return [...planVersions, ...variantVersions];
};

export const buildPlanMappings = ({
	latestProducts,
	allProducts,
	features,
	currency,
	stripeProductsById,
	stripeConnected,
	deferred = false,
}: {
	latestProducts: FullProduct[];
	allProducts: FullProduct[];
	features: Feature[];
	currency: string;
	stripeProductsById: Map<string, CatalogStripeProduct>;
	stripeConnected: boolean;
	deferred?: boolean;
}) =>
	latestProducts.map((product) => {
		const familyProducts = getPlanFamilyProducts({ product, allProducts });
		const familyContexts = familyProducts.map((familyProduct) =>
			buildProductMappingContext({
				product: familyProduct,
				features,
				currency,
			}),
		);
		const familyItemEntries = familyContexts.flatMap(
			(context) => context.itemPrices,
		);
		const allFamilyItems = familyItemEntries.map((entry) => entry.item);
		const itemMappingsByFilter = new Map<
			string,
			{
				label: string;
				filter: ReturnType<typeof itemToCanonicalFilter>;
				stripeProductIds: Set<string | null>;
			}
		>();

		for (const entry of familyItemEntries) {
			const filter = itemToCanonicalFilter({
				item: entry.item,
				allItems: allFamilyItems,
			});
			const key = filterKey(filter);
			const current = itemMappingsByFilter.get(key) ?? {
				label: entry.label,
				filter,
				stripeProductIds: new Set<string | null>(),
			};
			current.stripeProductIds.add(
				entry.price.config.stripe_product_id ?? null,
			);
			itemMappingsByFilter.set(key, current);
		}

		return {
			plan_id: product.id,
			mapping: buildStripeMapping({
				stripeProductId:
					product.processor?.type === ProcessorType.Stripe
						? product.processor.id
						: null,
				stripeProductsById,
				stripeConnected,
				deferred,
			}),
			item_mappings: Array.from(itemMappingsByFilter.values()).map(
				(itemMapping) => {
					const stripeProductIds = Array.from(itemMapping.stripeProductIds);
					return {
						label: itemMapping.label,
						filter: itemMapping.filter,
						mapping:
							stripeProductIds.length > 1
								? mappingConflict()
								: buildStripeMapping({
										stripeProductId: stripeProductIds[0] ?? null,
										stripeProductsById,
										stripeConnected,
										deferred,
									}),
					};
				},
			),
		};
	});
