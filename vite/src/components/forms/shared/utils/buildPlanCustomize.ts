import type {
	ApiPlanItemV1,
	CreatePlanItemParamsV1,
	CreateScheduleParamsV0,
	Feature,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { productItemsToPlanItemsV1 } from "@autumn/shared";
import { convertPrepaidOptionsToFeatureOptions } from "@/utils/billing/prepaidQuantityUtils";

export interface PlanCustomize {
	items?: CreatePlanItemParamsV1[];
	price?: ReturnType<typeof buildCustomizeBasePrice>;
}

/** The create APIs reject explicit nulls that the plan editor emits. */
function sanitizeForCreateParams({
	reset,
	price,
	rollover,
	proration,
	...rest
}: ApiPlanItemV1): CreatePlanItemParamsV1 {
	const sanitizedPrice = price
		? (() => {
				const { max_purchase, ...priceRest } = price;
				return {
					...priceRest,
					...(max_purchase != null ? { max_purchase } : {}),
				};
			})()
		: undefined;

	const sanitizedRollover = rollover
		? {
				max: rollover.max ?? undefined,
				max_percentage: rollover.max_percentage ?? undefined,
				expiry_duration_type: rollover.expiry_duration_type,
				expiry_duration_length: rollover.expiry_duration_length ?? undefined,
			}
		: undefined;
	const sanitizedProration =
		proration?.on_increase && proration.on_decrease
			? {
					on_increase: proration.on_increase,
					on_decrease: proration.on_decrease,
				}
			: undefined;

	return {
		...rest,
		...(reset ? { reset } : {}),
		...(sanitizedPrice ? { price: sanitizedPrice } : {}),
		...(sanitizedRollover ? { rollover: sanitizedRollover } : {}),
		...(sanitizedProration ? { proration: sanitizedProration } : {}),
	};
}

export function buildCustomizeItems({
	items,
	features,
}: {
	items: ProductItem[];
	features: Feature[];
}) {
	const featureItems = items.filter((item) => item.feature_id);
	if (featureItems.length === 0) return undefined;
	return productItemsToPlanItemsV1({ items: featureItems, features }).map(
		sanitizeForCreateParams,
	);
}

export function buildCustomizeBasePrice({ items }: { items: ProductItem[] }) {
	const priceItem = items.find(
		(item) => item.price != null && !item.feature_id,
	);
	if (!priceItem || priceItem.price === 0) return null;
	if (!priceItem.interval) return undefined;
	return {
		amount: priceItem.price,
		interval: priceItem.interval,
		...(priceItem.interval_count != null
			? { interval_count: priceItem.interval_count }
			: {}),
		...(priceItem.entitlement_id
			? { entitlement_id: priceItem.entitlement_id }
			: {}),
		...(priceItem.price_id ? { price_id: priceItem.price_id } : {}),
	};
}

export function buildCustomize({
	items,
	features,
	includeEmptyItems = false,
}: {
	items: ProductItem[] | null;
	features: Feature[];
	includeEmptyItems?: boolean;
}): PlanCustomize | undefined {
	if (!items) return undefined;
	const planItems = buildCustomizeItems({ items, features });
	const basePrice = buildCustomizeBasePrice({ items });
	if (!planItems && basePrice === undefined && !includeEmptyItems)
		return undefined;
	return {
		...(planItems || includeEmptyItems ? { items: planItems ?? [] } : {}),
		...(basePrice !== undefined ? { price: basePrice } : {}),
	};
}

export function buildCreateSchedulePlan({
	productId,
	prepaidOptions,
	items,
	version,
	isCustom,
	entityId,
	product,
	features,
	includeEmptyItems,
}: {
	productId: string;
	prepaidOptions: Record<string, number | undefined>;
	items: ProductItem[] | null;
	version?: number;
	isCustom: boolean;
	entityId?: string | null;
	product?: ProductV2;
	features: Feature[];
	includeEmptyItems?: boolean;
}): CreateScheduleParamsV0["phases"][number]["plans"][number] {
	const featureQuantities = convertPrepaidOptionsToFeatureOptions({
		prepaidOptions,
		product,
	});
	const customize = isCustom
		? buildCustomize({ items, features, includeEmptyItems })
		: undefined;

	return {
		plan_id: productId,
		...(entityId !== undefined ? { entity_id: entityId } : {}),
		...(featureQuantities ? { feature_quantities: featureQuantities } : {}),
		...(version !== undefined ? { version } : {}),
		...(customize ? { customize } : {}),
	};
}
