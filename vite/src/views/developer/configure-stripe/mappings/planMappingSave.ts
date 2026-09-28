import type { ProductV2, UpdateCatalogPlanParamsInput } from "@autumn/shared";
import type { CatalogMappingsSave } from "@/hooks/queries/catalog/useCatalogMappings";
import type { CatalogPlanMapping } from "./catalogMappingsForm";
import type { PriceMappingRow } from "./priceMappingRows";
import { CREATE_STRIPE_PRODUCT } from "./StripeProductSelect";

/** `null` on a variant means it shares the base plan's product. */
export type PlanSheetValues = {
	stripe_product_id: string | null;
	variant_product_ids: Record<string, string | null>;
	/** Only prices the user touched; others keep whatever they bill under. */
	price_ids: Record<string, string | null>;
};

const variantOwnProductId = ({
	base,
	variant,
}: {
	base: ProductV2;
	variant: ProductV2;
}) =>
	variant.stripe_id && variant.stripe_id !== base.stripe_id
		? variant.stripe_id
		: null;

export const buildPlanSheetValues = ({
	planMapping,
	base,
	variants,
}: {
	planMapping: CatalogPlanMapping;
	base: ProductV2;
	variants: ProductV2[];
}): PlanSheetValues => ({
	stripe_product_id: planMapping.mapping.stripe_product_id,
	variant_product_ids: Object.fromEntries(
		variants.map((variant) => [
			variant.id,
			variantOwnProductId({ base, variant }),
		]),
	),
	price_ids: {},
});

const isRealProductId = (value: string | null): value is string =>
	Boolean(value) && value !== CREATE_STRIPE_PRODUCT;

/** The product a plan's prices bill under once this sheet saves. */
export const effectivePlanProductId = ({
	values,
	basePlanId,
	planId,
}: {
	values: PlanSheetValues;
	basePlanId: string;
	planId: string;
}) =>
	planId === basePlanId
		? values.stripe_product_id
		: (values.variant_product_ids[planId] ?? values.stripe_product_id);

/** A price keeps showing its Stripe price until the user moves its plan to another product. */
export const displayedStripePriceId = ({
	row,
	values,
	initial,
	basePlanId,
}: {
	row: PriceMappingRow;
	values: PlanSheetValues;
	initial: PlanSheetValues;
	basePlanId: string;
}) => {
	if (row.priceId in values.price_ids) return values.price_ids[row.priceId];
	const productChanged =
		effectivePlanProductId({ values, basePlanId, planId: row.planId }) !==
		effectivePlanProductId({ values: initial, basePlanId, planId: row.planId });
	return productChanged ? null : row.stripePriceId;
};

const variantProcessorEntries = ({
	values,
	initial,
	baseChanged,
}: {
	values: PlanSheetValues;
	initial: PlanSheetValues;
	baseChanged: boolean;
}): NonNullable<UpdateCatalogPlanParamsInput["variants"]> =>
	Object.entries(values.variant_product_ids).flatMap(
		([variantPlanId, productId]) => {
			if (productId === CREATE_STRIPE_PRODUCT) return [];
			const changed = productId !== initial.variant_product_ids[variantPlanId];
			// A variant with its own product is restated on a base change so it is not fanned over.
			const shieldFromBase = baseChanged && productId !== null;
			if (!changed && !shieldFromBase) return [];

			const resolvedId = productId ?? values.stripe_product_id;
			if (resolvedId === CREATE_STRIPE_PRODUCT) return [];
			return [
				{
					variant_plan_id: variantPlanId,
					processors: {
						stripe: resolvedId ? { product_id: resolvedId } : null,
					},
				},
			];
		},
	);

const buildCatalogUpdate = ({
	planMapping,
	values,
	initial,
}: {
	planMapping: CatalogPlanMapping;
	values: PlanSheetValues;
	initial: PlanSheetValues;
}): CatalogMappingsSave["catalog"] => {
	const baseChanged =
		values.stripe_product_id !== initial.stripe_product_id &&
		values.stripe_product_id !== CREATE_STRIPE_PRODUCT;
	const variants = variantProcessorEntries({ values, initial, baseChanged });
	if (!baseChanged && variants.length === 0) return undefined;

	// Aliases are carried back unchanged: an omitted list would clear them.
	const additionalProductIds = planMapping.additional_mappings
		.map((mapping) => mapping.stripe_product_id)
		.filter((id): id is string => Boolean(id));
	const baseProcessors = values.stripe_product_id
		? {
				product_id: values.stripe_product_id,
				...(additionalProductIds.length
					? { additional_product_ids: additionalProductIds }
					: {}),
			}
		: null;

	return {
		plans: [
			{
				plan_id: planMapping.plan_id,
				...(baseChanged ? { processors: { stripe: baseProcessors } } : {}),
				...(variants.length > 0 ? { variants } : {}),
			},
		],
	};
};

const buildPriceMappings = ({
	values,
	rows,
	basePlanId,
}: {
	values: PlanSheetValues;
	rows: PriceMappingRow[];
	basePlanId: string;
}) =>
	rows.flatMap((row) => {
		if (!(row.priceId in values.price_ids)) return [];
		const productId = effectivePlanProductId({
			values,
			basePlanId,
			planId: row.planId,
		});
		if (!isRealProductId(productId)) return [];
		return [
			{
				price_id: row.priceId,
				stripe_product_id: productId,
				stripe_price_id: values.price_ids[row.priceId] ?? null,
			},
		];
	});

export const buildPlanSheetSave = ({
	planMapping,
	values,
	initial,
	rows,
}: {
	planMapping: CatalogPlanMapping;
	values: PlanSheetValues;
	initial: PlanSheetValues;
	rows: PriceMappingRow[];
}): CatalogMappingsSave => {
	const priceMappings = buildPriceMappings({
		values,
		rows,
		basePlanId: planMapping.plan_id,
	});

	return {
		catalog: buildCatalogUpdate({ planMapping, values, initial }),
		createPlanIds:
			values.stripe_product_id === CREATE_STRIPE_PRODUCT &&
			initial.stripe_product_id !== CREATE_STRIPE_PRODUCT
				? [planMapping.plan_id]
				: [],
		splitVariantPlanIds: Object.entries(values.variant_product_ids)
			.filter(([, productId]) => productId === CREATE_STRIPE_PRODUCT)
			.map(([variantPlanId]) => variantPlanId),
		mappings:
			priceMappings.length > 0 ? { price_mappings: priceMappings } : undefined,
	};
};

/** Prices whose Stripe resources change: plans moving product, plus any the user picked. */
export const affectedPlanPriceIds = ({
	values,
	initial,
	rows,
	basePlanId,
}: {
	values: PlanSheetValues;
	initial: PlanSheetValues;
	rows: PriceMappingRow[];
	basePlanId: string;
}) =>
	rows
		.filter(
			(row) =>
				row.priceId in values.price_ids ||
				effectivePlanProductId({ values, basePlanId, planId: row.planId }) !==
					effectivePlanProductId({
						values: initial,
						basePlanId,
						planId: row.planId,
					}),
		)
		.map((row) => row.priceId);
