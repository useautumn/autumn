import type {
	ApiPlanItemV1,
	CreateScheduleParamsV0,
	Feature,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { productItemsToPlanItemsV1 } from "@autumn/shared";
import { useMemo } from "react";
import { convertPrepaidOptionsToFeatureOptions } from "@/utils/billing/prepaidQuantityUtils";

type CreatePlanItemParams = Omit<ApiPlanItemV1, "reset" | "price"> & {
	reset?: ApiPlanItemV1["reset"];
	price?: ApiPlanItemV1["price"];
};

import {
	getCreateSchedulePhaseTimingError,
	hasPersistedCreateSchedule,
	type SchedulePhase,
} from "../createScheduleFormSchema";

function sanitizeForCreateParams({
	reset,
	price,
	...rest
}: ApiPlanItemV1): CreatePlanItemParams {
	const sanitizedPrice = price
		? (() => {
				const { max_purchase, ...priceRest } = price;
				return {
					...priceRest,
					...(max_purchase != null ? { max_purchase } : {}),
				};
			})()
		: undefined;

	return {
		...rest,
		...(reset ? { reset } : {}),
		...(sanitizedPrice ? { price: sanitizedPrice } : {}),
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
	if (!priceItem?.price || !priceItem.interval) return undefined;
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
}: {
	items: ProductItem[] | null;
	features: Feature[];
}) {
	if (!items) return undefined;
	const planItems = buildCustomizeItems({ items, features });
	const basePrice = buildCustomizeBasePrice({ items });
	if (!planItems && !basePrice) return undefined;
	return {
		...(planItems ? { items: planItems } : {}),
		...(basePrice ? { price: basePrice } : {}),
	};
}

export function buildCreateScheduleRequestBody({
	customerId,
	entityId,
	phases,
	products,
	features,
	nowMs,
}: {
	customerId: string | undefined;
	entityId: string | undefined;
	phases: SchedulePhase[];
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
}): CreateScheduleParamsV0 | null {
	const now = nowMs ?? Date.now();
	if (!customerId || phases.length === 0) return null;
	if (getCreateSchedulePhaseTimingError({ phases, nowMs: now })) return null;
	const hasPersistedSchedule = hasPersistedCreateSchedule({ phases });

	const apiPhases = phases.map((phase, index) => {
		const startsAt =
			index === 0 && !hasPersistedSchedule ? now : phase.startsAt;
		if (startsAt === null) return null;

		const plans = phase.plans
			.filter((plan) => plan.productId)
			.map((plan) => {
				const product = products.find((p) => p.id === plan.productId);
				const featureQuantities = convertPrepaidOptionsToFeatureOptions({
					prepaidOptions: plan.prepaidOptions,
					product,
				});
				const customize = plan.isCustom
					? buildCustomize({ items: plan.items, features })
					: undefined;

				return {
					plan_id: plan.productId,
					...(featureQuantities
						? { feature_quantities: featureQuantities }
						: {}),
					...(plan.version !== undefined ? { version: plan.version } : {}),
					...(customize ? { customize } : {}),
				};
			});

		if (plans.length === 0) return null;
		return { starts_at: startsAt, plans };
	});

	const validPhases = apiPhases.filter(
		(phase): phase is NonNullable<typeof phase> => phase !== null,
	);
	if (validPhases.length === 0) return null;

	const body: Record<string, unknown> = {
		customer_id: customerId,
		phases: validPhases,
	};
	if (entityId) body.entity_id = entityId;
	return body as CreateScheduleParamsV0;
}

export function useCreateScheduleRequestBody({
	customerId,
	entityId,
	phases,
	products,
	features,
	nowMs,
}: {
	customerId: string | undefined;
	entityId: string | undefined;
	phases: SchedulePhase[];
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
}) {
	return useMemo(
		() =>
			buildCreateScheduleRequestBody({
				customerId,
				entityId,
				phases,
				products,
				features,
				nowMs,
			}),
		[customerId, entityId, phases, products, features, nowMs],
	);
}
