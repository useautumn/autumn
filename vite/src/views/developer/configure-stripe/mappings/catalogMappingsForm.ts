import type {
	CatalogGetMappingsResponse,
	CatalogStripeMapping,
	CatalogStripeProduct,
	ProductV2,
	UpdateCatalogParamsInput,
} from "@autumn/shared";
import { productV2ToBasePrice } from "@autumn/shared";

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
		...planMapping.additional_mappings.map(
			(mapping) => mapping.stripe_product_id,
		),
	].filter((id): id is string => Boolean(id));
};

/** Rolls a plan's product and aliases into the most severe status. */
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

	const resolved = [planMapping.mapping, ...planMapping.additional_mappings].map(
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
};

const normalizeFormStripeProductId = (stripeProductId: string | null) =>
	stripeProductId?.trim() || null;

export const buildPlanDetailFormValues = (
	planMapping: CatalogPlanMapping,
): PlanDetailFormValues => ({
	stripe_product_id: planMapping.mapping.stripe_product_id,
});

/**
 * A plan's product is plan-wide, so this writes through catalogV2 and the
 * server fans it out to every version and variant. Aliases are carried back
 * unchanged: an omitted list would clear the ones the plan already holds.
 */
export const buildPlanProcessorsUpdate = ({
	planMapping,
	values,
}: {
	planMapping: CatalogPlanMapping;
	values: PlanDetailFormValues;
}): UpdateCatalogParamsInput => {
	const stripeProductId = normalizeFormStripeProductId(values.stripe_product_id);
	const additionalProductIds = planMapping.additional_mappings
		.map((mapping) => normalizeFormStripeProductId(mapping.stripe_product_id))
		.filter((id): id is string => Boolean(id));

	return {
		plans: [
			{
				plan_id: planMapping.plan_id,
				processors: {
					stripe: stripeProductId
						? {
								product_id: stripeProductId,
								...(additionalProductIds.length
									? { additional_product_ids: additionalProductIds }
									: {}),
							}
						: null,
				},
			},
		],
	};
};

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

/** Base prices across the family — the rows a product change re-points. */
export const getAffectedCatalogPriceIds = ({
	base,
	products,
	planMapping,
	values,
}: {
	base: ProductV2;
	products: ProductV2[];
	planMapping: CatalogPlanMapping;
	// Aliases never touch Stripe price resources, so they can't affect prices.
	values: PlanDetailFormValues;
}) => {
	const mappingChanged =
		normalizeFormStripeProductId(planMapping.mapping.stripe_product_id) !==
		normalizeFormStripeProductId(values.stripe_product_id);
	if (!mappingChanged) return [];

	const affectedPriceIds = new Set<string>();
	for (const product of getPlanFamilyProductVersions({ base, products })) {
		const basePriceId = productV2ToBasePrice({ product })?.price_id;
		if (basePriceId) affectedPriceIds.add(basePriceId);
	}

	return [...affectedPriceIds];
};
