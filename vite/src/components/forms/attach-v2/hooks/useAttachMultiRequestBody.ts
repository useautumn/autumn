import type { Feature, MultiAttachParamsV0, ProductV2 } from "@autumn/shared";
import { useCallback, useMemo } from "react";
import { applyMultiPlanStageParams } from "@/components/forms/shared/utils/applyMultiPlanStageParams";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";
import { buildBillingPlan } from "@/components/forms/shared/utils/buildPlanCustomize";
import { filterValidDiscounts } from "@/components/forms/shared/utils/discountUtils";
import { freeTrialFormValuesToParams } from "@/components/forms/shared/utils/freeTrialFormValues";
import { normalizeBillingRequestItems } from "@/components/forms/shared/utils/normalizeBillingRequestItems";
import type { AttachAdditionalPlan } from "../attachFormSchema";
import { stripPricesFromItems } from "../utils/grantFreeUtils";
import type { BuildAttachRequestBodyParams } from "./useAttachRequestBody";

export type BuildAttachMultiRequestBodyParams = Pick<
	BuildAttachRequestBodyParams,
	| "customerId"
	| "entityId"
	| "product"
	| "prepaidOptions"
	| "items"
	| "grantFree"
	| "version"
	| "trialLength"
	| "trialDuration"
	| "trialEnabled"
	| "trialCardRequired"
	| "trialOnEnd"
	| "prorationBehavior"
	| "redirectMode"
	| "discounts"
	| "currency"
	| "startDate"
	| "resetBillingCycle"
> & {
	products: ProductV2[];
	features: Feature[];
	additionalPlans: AttachAdditionalPlan[];
	hasInvalidPlanScopes?: boolean;
};

function buildPlanParams({
	planId,
	prepaidOptions,
	items,
	version,
	isCustom,
	entityId,
	grantFree,
	product,
	features,
}: {
	planId: string;
	prepaidOptions: Record<string, number | undefined>;
	items: BuildAttachRequestBodyParams["items"];
	version: number | undefined;
	isCustom: boolean;
	entityId?: string | null;
	grantFree: boolean;
	product: ProductV2 | undefined;
	features: Feature[];
}) {
	const normalizedItems = normalizeBillingRequestItems({ items }) ?? null;
	const customizedItems = grantFree
		? stripPricesFromItems({ items: normalizedItems ?? product?.items ?? [] })
		: normalizedItems;

	return buildBillingPlan({
		productId: planId,
		prepaidOptions,
		items: customizedItems,
		version,
		isCustom: isCustom || grantFree,
		entityId,
		product,
		features,
		includeEmptyItems: grantFree,
	});
}

export function buildAttachMultiRequestBody({
	customerId,
	entityId,
	product,
	products,
	features,
	additionalPlans,
	prepaidOptions,
	items,
	grantFree,
	version,
	trialLength,
	trialDuration,
	trialEnabled,
	trialCardRequired,
	trialOnEnd,
	prorationBehavior,
	redirectMode,
	discounts,
	currency,
	startDate,
	resetBillingCycle,
	hasInvalidPlanScopes = false,
}: BuildAttachMultiRequestBodyParams): MultiAttachParamsV0 | null {
	if (hasInvalidPlanScopes || !customerId || !product) return null;

	const selectedAdditionalPlans = additionalPlans.filter(
		(plan) => plan.productId,
	);
	if (selectedAdditionalPlans.length === 0) return null;

	const productsById = new Map(products.map((plan) => [plan.id, plan]));
	const plans = [
		buildPlanParams({
			planId: product.id,
			prepaidOptions,
			items,
			version,
			isCustom: items !== null,
			entityId: undefined,
			grantFree,
			product,
			features,
		}),
		...selectedAdditionalPlans.map((plan) =>
			buildPlanParams({
				planId: plan.productId,
				prepaidOptions: plan.prepaidOptions,
				items: plan.items,
				version: plan.version,
				isCustom: plan.isCustom,
				entityId: plan.entityId,
				grantFree,
				product: productsById.get(plan.productId),
				features,
			}),
		),
	];
	const freeTrial = freeTrialFormValuesToParams({
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		trialOnEnd,
	});
	const validDiscounts = filterValidDiscounts(discounts);

	return {
		customer_id: customerId,
		plans,
		redirect_mode: redirectMode,
		free_trial: freeTrial ?? null,
		...(prorationBehavior ? { billing_behavior: prorationBehavior } : {}),
		...(entityId ? { entity_id: entityId } : {}),
		...(currency ? { currency: currency.toLowerCase() } : {}),
		...(validDiscounts.length > 0 ? { discounts: validDiscounts } : {}),
		...(startDate ? { starts_at: startDate } : {}),
		...(resetBillingCycle ? { billing_cycle_anchor: "now" as const } : {}),
	};
}

export function useAttachMultiRequestBody(
	params: BuildAttachMultiRequestBodyParams,
) {
	const {
		customerId,
		entityId,
		product,
		products,
		features,
		additionalPlans,
		prepaidOptions,
		items,
		grantFree,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		trialOnEnd,
		prorationBehavior,
		redirectMode,
		discounts,
		currency,
		startDate,
		resetBillingCycle,
		hasInvalidPlanScopes,
	} = params;
	const requestBody = useMemo(
		() =>
			buildAttachMultiRequestBody({
				customerId,
				entityId,
				product,
				products,
				features,
				additionalPlans,
				prepaidOptions,
				items,
				grantFree,
				version,
				trialLength,
				trialDuration,
				trialEnabled,
				trialCardRequired,
				trialOnEnd,
				prorationBehavior,
				redirectMode,
				discounts,
				currency,
				startDate,
				resetBillingCycle,
				hasInvalidPlanScopes,
			}),
		[
			customerId,
			entityId,
			product,
			products,
			features,
			additionalPlans,
			prepaidOptions,
			items,
			grantFree,
			version,
			trialLength,
			trialDuration,
			trialEnabled,
			trialCardRequired,
			trialOnEnd,
			prorationBehavior,
			redirectMode,
			discounts,
			currency,
			startDate,
			resetBillingCycle,
			hasInvalidPlanScopes,
		],
	);
	const buildRequestBody = useCallback(
		(stageParams: BillingStageParams = {}) =>
			applyMultiPlanStageParams({ ...stageParams, requestBody }),
		[requestBody],
	);

	return { requestBody, buildRequestBody };
}
