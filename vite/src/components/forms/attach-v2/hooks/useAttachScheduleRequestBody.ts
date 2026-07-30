import type {
	CreateScheduleParamsV0,
	Feature,
	ProductV2,
} from "@autumn/shared";
import { applyCreateScheduleStageParams } from "@/components/forms/shared/utils/applyCreateScheduleStageParams";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";
import { buildCreateSchedulePlan } from "@/components/forms/shared/utils/buildPlanCustomize";
import { normalizeBillingRequestItems } from "@/components/forms/shared/utils/normalizeBillingRequestItems";
import { getFreeTrial } from "@/components/forms/update-subscription-v2/utils/getFreeTrial";
import type { AttachAdditionalPlan } from "../attachFormSchema";
import { filterValidDiscounts } from "../utils/discountUtils";
import { stripPricesFromItems } from "../utils/grantFreeUtils";
import type { BuildAttachRequestBodyParams } from "./useAttachRequestBody";

export type BuildAttachScheduleRequestBodyParams = Pick<
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
	| "redirectMode"
	| "discounts"
	| "currency"
> & {
	products: ProductV2[];
	features: Feature[];
	additionalPlans: AttachAdditionalPlan[];
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

	return buildCreateSchedulePlan({
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

export function buildAttachScheduleRequestBody({
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
	redirectMode,
	discounts,
	currency,
}: BuildAttachScheduleRequestBodyParams): CreateScheduleParamsV0 | null {
	if (!customerId || !product) return null;

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
	const freeTrial = getFreeTrial({
		removeTrial: false,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
	});
	const validDiscounts = filterValidDiscounts(discounts);

	return {
		customer_id: customerId,
		phases: [{ starts_at: "now", plans }],
		preserve_add_ons: true,
		redirect_mode: redirectMode,
		free_trial: freeTrial
			? {
					duration_length: freeTrial.length,
					duration_type: freeTrial.duration,
					card_required: freeTrial.card_required,
				}
			: null,
		...(entityId ? { entity_id: entityId } : {}),
		...(currency ? { currency: currency.toLowerCase() } : {}),
		...(validDiscounts.length > 0 ? { discounts: validDiscounts } : {}),
	};
}

export function useAttachScheduleRequestBody(
	params: BuildAttachScheduleRequestBodyParams,
) {
	const requestBody = buildAttachScheduleRequestBody(params);

	return {
		requestBody,
		buildRequestBody: (stageParams: BillingStageParams = {}) =>
			applyCreateScheduleStageParams({ ...stageParams, requestBody }),
	};
}
