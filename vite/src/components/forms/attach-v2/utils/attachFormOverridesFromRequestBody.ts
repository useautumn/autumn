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
	overridesFromRequest,
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
import type { AttachForm, FormCustomLineItem } from "../attachFormSchema";

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

/** Inverse of buildAttachRequestBody. Stage-scoped keys (invoice*, redirect,
 * checkout params) are intentionally skipped — the review stage re-collects
 * them; billing_controls has no form control and gates linkability instead. */
export const attachFormOverridesFromRequestBody = (
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
	...trialOverridesFrom(request.free_trial),
});
