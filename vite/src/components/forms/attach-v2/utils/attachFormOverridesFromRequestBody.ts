import type {
	AttachDiscount,
	BillingBehavior,
	CustomizePlanLicense,
	PlanTiming,
	ProductItem,
} from "@autumn/shared";
import {
	anchorOverridesFrom,
	type FieldReaders,
	freeTrialFromRequest,
	overridesFromRequest,
	quantityRecordFrom,
	readArray,
	readBoolean,
	readEnum,
	readNumber,
	readQuantities,
	readStampedArray,
	readString,
	readStringArray,
	requestRecord,
	trialOverridesFrom,
} from "@/components/forms/shared/utils/requestBodyOverrideHelpers";
import type {
	AttachAdditionalPlan,
	AttachForm,
	FormCustomLineItem,
} from "../attachFormSchema";

const ATTACH_FIELD_READERS: FieldReaders<AttachForm> = {
	addLicenses: readArray<CustomizePlanLicense>("upsert_licenses"),
	currency: readString("currency"),
	discounts: readStampedArray<AttachDiscount>("discounts", "seeded-discount"),
	enablePlanImmediately: readBoolean("enable_product_immediately"),
	endDate: readNumber("ends_at"),
	items: readArray<ProductItem>("items"),
	licenseQuantities: readQuantities("license_quantities", "license_plan_id"),
	longLivedCheckout: readBoolean("long_lived_checkout"),
	newBillingSubscription: readBoolean("new_billing_subscription"),
	noBillingChanges: readBoolean("no_billing_changes"),
	planSchedule: readEnum<PlanTiming>("plan_schedule"),
	prepaidOptions: readQuantities("options", "feature_id"),
	productId: readString("product_id"),
	prorationBehavior: readEnum<BillingBehavior>("billing_behavior"),
	removePlanIds: readStringArray("remove_plan_ids"),
	startDate: readNumber("starts_at"),
	version: readNumber("version"),
	customLineItems: (request) =>
		Array.isArray(request.custom_line_items)
			? request.custom_line_items.flatMap(
					(value, index): FormCustomLineItem[] => {
						const item = requestRecord(value);
						return typeof item?.amount === "number" &&
							typeof item.description === "string"
							? [
									{
										_id: `seeded-line-item-${index}`,
										amount: item.amount,
										description: item.description,
									},
								]
							: [];
					},
				)
			: undefined,
};

const carryOverFrom = (
	value: unknown,
	fields: { enabled: keyof AttachForm; featureIds: keyof AttachForm },
): Partial<AttachForm> => {
	const carryOver = requestRecord(value);
	if (!carryOver?.enabled) return {};
	return {
		[fields.enabled]: true,
		...(Array.isArray(carryOver.feature_ids)
			? { [fields.featureIds]: carryOver.feature_ids }
			: {}),
	};
};

const requestPlanFields = (plan: Record<string, unknown>) => {
	const items = Array.isArray(plan.items)
		? (plan.items as ProductItem[])
		: null;
	const prepaidOptions = quantityRecordFrom(
		plan.feature_quantities,
		"feature_id",
	);
	return {
		isCustom: items !== null,
		items,
		prepaidOptions,
		productId: typeof plan.plan_id === "string" ? plan.plan_id : "",
		version: typeof plan.version === "number" ? plan.version : undefined,
	};
};

/** Inverse of buildAttachMultiRequestBody: plans[0] seeds the primary plan
 * fields, the rest become additionalPlans rows. */
const multiAttachOverridesFromRequestBody = (
	request: Record<string, unknown>,
): Partial<AttachForm> => {
	const plans = request.plans as Record<string, unknown>[];
	const [primaryPlan, ...additionalRequestPlans] = plans;
	const primary = requestPlanFields(primaryPlan ?? {});

	const additionalPlans: AttachAdditionalPlan[] = additionalRequestPlans.map(
		(plan, index) => ({
			_id: `seeded-plan-${index}`,
			entityId: typeof plan.entity_id === "string" ? plan.entity_id : null,
			...requestPlanFields(plan),
		}),
	);

	return {
		additionalPlans,
		productId: primary.productId,
		prepaidOptions: primary.prepaidOptions,
		...(primary.items ? { isCustom: true, items: primary.items } : {}),
		...(primary.version !== undefined ? { version: primary.version } : {}),
		...(typeof request.currency === "string"
			? { currency: request.currency }
			: {}),
		...(typeof request.starts_at === "number"
			? { startDate: request.starts_at }
			: {}),
		...(typeof request.billing_behavior === "string"
			? { prorationBehavior: request.billing_behavior as BillingBehavior }
			: {}),
		...(typeof request.new_billing_subscription === "boolean"
			? { newBillingSubscription: request.new_billing_subscription }
			: {}),
		...(typeof request.enable_plan_immediately === "boolean"
			? { enablePlanImmediately: request.enable_plan_immediately }
			: {}),
		...(Array.isArray(request.discounts)
			? {
					discounts: (request.discounts as AttachDiscount[]).map(
						(discount, index) => ({
							...discount,
							_id: `seeded-discount-${index}`,
						}),
					),
				}
			: {}),
		...trialOverridesFrom(freeTrialFromRequest(request)),
	};
};

/** Inverse of buildAttachRequestBody (or buildAttachMultiRequestBody when the
 * request carries `plans`). Stage-scoped keys (invoice*, redirect, checkout
 * params) are intentionally skipped — the review stage re-collects them;
 * billing_controls has no form control and gates linkability instead. */
export const attachFormOverridesFromRequestBody = (
	request: Record<string, unknown>,
): Partial<AttachForm> =>
	Array.isArray(request.plans) && request.plans.length > 0
		? multiAttachOverridesFromRequestBody(request)
		: singleAttachOverridesFromRequestBody(request);

const singleAttachOverridesFromRequestBody = (
	request: Record<string, unknown>,
): Partial<AttachForm> => ({
	...overridesFromRequest(request, ATTACH_FIELD_READERS),
	...(Array.isArray(request.items) ? { isCustom: true } : {}),
	...anchorOverridesFrom(request.billing_cycle_anchor),
	...carryOverFrom(request.carry_over_balances, {
		enabled: "carryOverBalances",
		featureIds: "carryOverBalanceFeatureIds",
	}),
	...carryOverFrom(request.carry_over_usages, {
		enabled: "carryOverUsages",
		featureIds: "carryOverUsageFeatureIds",
	}),
	...trialOverridesFrom(freeTrialFromRequest(request)),
});
