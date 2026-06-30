import type {
	CatalogGetMappingsResponse,
	CatalogStripeMapping,
	CatalogStripeProduct,
	CatalogUpdateMappingsParams,
	ProductV2,
} from "@autumn/shared";
import {
	isFeaturePriceItem,
	matchesPlanItemFilter,
	productV2ToBasePrice,
	productV2ToFeatureItems,
} from "@autumn/shared";

export type PlanMappingGroup = {
	base: ProductV2;
	variants: Array<{ plan: ProductV2 }>;
};

const isBasePlan = (product: ProductV2) => !product.base_internal_product_id;

/** Groups variants under their base plan; variants share the base's mapping. */
export const groupPlanMappings = (
	products: ProductV2[],
): PlanMappingGroup[] => {
	const baseInternalIds = new Set(
		products
			.filter(isBasePlan)
			.map((product) => product.internal_id)
			.filter((id): id is string => Boolean(id)),
	);

	const variantsByBaseId = new Map<string, ProductV2[]>();
	for (const product of products) {
		const baseInternalId = product.base_internal_product_id;
		if (!baseInternalId || !baseInternalIds.has(baseInternalId)) continue;
		const siblings = variantsByBaseId.get(baseInternalId) ?? [];
		siblings.push(product);
		variantsByBaseId.set(baseInternalId, siblings);
	}

	const groups: PlanMappingGroup[] = [];
	for (const product of products) {
		const isNestedVariant =
			Boolean(product.base_internal_product_id) &&
			baseInternalIds.has(product.base_internal_product_id as string);
		if (isNestedVariant) continue;

		const variants = product.internal_id
			? (variantsByBaseId.get(product.internal_id) ?? [])
			: [];
		groups.push({
			base: product,
			variants: variants.map((variant) => ({ plan: variant })),
		});
	}

	return groups;
};

export type CatalogPlanMapping =
	CatalogGetMappingsResponse["plan_mappings"][number];

export const findPlanMapping = ({
	mappings,
	planId,
}: {
	mappings: CatalogGetMappingsResponse;
	planId: string;
}): CatalogPlanMapping | undefined =>
	mappings.plan_mappings.find((mapping) => mapping.plan_id === planId);

// Ordering drives the master row rollup: real errors win, then a verified base,
// then in-progress states. An unmapped item must NOT override a mapped base, so
// `unmapped` ranks below `ok`.
const STATUS_SEVERITY: Record<CatalogStripeMapping["status"], number> = {
	unmapped: 0,
	unchecked: 1,
	ok: 2,
	inactive: 3,
	missing: 4,
	conflict: 5,
};

export type ResolvedMapping = {
	status: CatalogStripeMapping["status"];
	stripeProduct: CatalogStripeProduct | null;
	pending: boolean;
};

/**
 * Computes a mapping's status from lazily-resolved Stripe products. While the
 * resolve query is in flight and the id is unresolved, `pending` is true so the
 * UI can show a skeleton instead of a premature "missing".
 */
export const resolveMapping = ({
	stripeProductId,
	backendStatus,
	stripeConnected,
	stripeProductsById,
	isResolving,
}: {
	stripeProductId: string | null;
	backendStatus?: CatalogStripeMapping["status"];
	stripeConnected: boolean;
	stripeProductsById: Map<string, CatalogStripeProduct>;
	isResolving: boolean;
}): ResolvedMapping => {
	if (backendStatus === "conflict" && !stripeProductId) {
		return { status: "conflict", stripeProduct: null, pending: false };
	}
	if (!stripeProductId) {
		return { status: "unmapped", stripeProduct: null, pending: false };
	}
	if (!stripeConnected) {
		return { status: "unchecked", stripeProduct: null, pending: false };
	}
	const stripeProduct = stripeProductsById.get(stripeProductId) ?? null;
	if (stripeProduct) {
		return {
			status: stripeProduct.active ? "ok" : "inactive",
			stripeProduct,
			pending: false,
		};
	}
	if (isResolving) {
		return { status: "unchecked", stripeProduct: null, pending: true };
	}
	return { status: "missing", stripeProduct: null, pending: false };
};

export const collectPlanStripeProductIds = (
	planMapping: CatalogPlanMapping | undefined,
): string[] => {
	if (!planMapping) return [];
	return [
		planMapping.mapping.stripe_product_id,
		...planMapping.item_mappings.map((item) => item.mapping.stripe_product_id),
	].filter((id): id is string => Boolean(id));
};

/** Rolls a plan's base + item statuses into the most severe one for the master row. */
export const rollupPlanStatus = ({
	planMapping,
	stripeConnected,
	stripeProductsById,
	isResolving,
}: {
	planMapping: CatalogPlanMapping | undefined;
	stripeConnected: boolean;
	stripeProductsById: Map<string, CatalogStripeProduct>;
	isResolving: boolean;
}): ResolvedMapping => {
	if (!planMapping) {
		return { status: "unmapped", stripeProduct: null, pending: false };
	}

	const resolved = [planMapping.mapping, ...planMapping.item_mappings].map(
		(mapping) =>
			resolveMapping({
				stripeProductId: mapping.stripe_product_id,
				backendStatus: mapping.status,
				stripeConnected,
				stripeProductsById,
				isResolving,
			}),
	);

	if (resolved.some((entry) => entry.pending)) {
		return { status: "unchecked", stripeProduct: null, pending: true };
	}

	return resolved.reduce((worst, entry) =>
		STATUS_SEVERITY[entry.status] > STATUS_SEVERITY[worst.status]
			? entry
			: worst,
	);
};

export type PlanDetailFormValues = {
	stripe_product_id: string | null;
	item_mappings: Array<{ stripe_product_id: string | null }>;
};

const normalizeFormStripeProductId = (stripeProductId: string | null) =>
	stripeProductId?.trim() || null;

export const buildPlanDetailFormValues = (
	planMapping: CatalogPlanMapping,
): PlanDetailFormValues => ({
	stripe_product_id: planMapping.mapping.stripe_product_id,
	item_mappings: planMapping.item_mappings.map((item) => ({
		stripe_product_id: item.mapping.stripe_product_id,
	})),
});

export const buildUpdatePlanMappingParams = ({
	planMapping,
	values,
}: {
	planMapping: CatalogPlanMapping;
	values: PlanDetailFormValues;
}): CatalogUpdateMappingsParams => ({
	processor_type: "stripe",
	plan_mappings: [
		{
			plan_id: planMapping.plan_id,
			stripe_product_id: normalizeFormStripeProductId(values.stripe_product_id),
			scope: "base_price",
			item_mappings: planMapping.item_mappings.map((item, index) => ({
				filter: item.filter,
				stripe_product_id:
					normalizeFormStripeProductId(
						values.item_mappings[index]?.stripe_product_id ?? null,
					),
			})),
		},
	],
});

export const getPlanFamilyProductVersions = ({
	base,
	products,
}: {
	base: ProductV2;
	products: ProductV2[];
}) => {
	const baseVersions = products.filter((product) => product.id === base.id);
	const baseInternalIds = new Set(
		baseVersions
			.map((product) => product.internal_id)
			.filter((id): id is string => Boolean(id)),
	);
	const variants = products.filter((product) => {
		const baseInternalProductId = product.base_internal_product_id;
		return Boolean(
			baseInternalProductId && baseInternalIds.has(baseInternalProductId),
		);
	});

	return [...baseVersions, ...variants];
};

export const getAffectedCatalogPriceIds = ({
	base,
	products,
	planMapping,
	values,
}: {
	base: ProductV2;
	products: ProductV2[];
	planMapping: CatalogPlanMapping;
	values: PlanDetailFormValues;
}) => {
	const affectedPriceIds = new Set<string>();
	const familyProducts = getPlanFamilyProductVersions({ base, products });
	const baseMappingChanged =
		normalizeFormStripeProductId(planMapping.mapping.stripe_product_id) !==
		normalizeFormStripeProductId(values.stripe_product_id);

	if (baseMappingChanged) {
		for (const product of familyProducts) {
			const basePriceId = productV2ToBasePrice({ product })?.price_id;
			if (basePriceId) affectedPriceIds.add(basePriceId);
		}
	}

	for (const [index, itemMapping] of planMapping.item_mappings.entries()) {
		const itemMappingChanged =
			normalizeFormStripeProductId(itemMapping.mapping.stripe_product_id) !==
			normalizeFormStripeProductId(
				values.item_mappings[index]?.stripe_product_id ?? null,
			);
		if (!itemMappingChanged) continue;

		for (const product of familyProducts) {
			for (const item of productV2ToFeatureItems({ items: product.items })) {
				if (!isFeaturePriceItem(item)) continue;
				if (!matchesPlanItemFilter({ item, filter: itemMapping.filter })) {
					continue;
				}
				if (item.price_id) affectedPriceIds.add(item.price_id);
			}
		}
	}

	return [...affectedPriceIds];
};
