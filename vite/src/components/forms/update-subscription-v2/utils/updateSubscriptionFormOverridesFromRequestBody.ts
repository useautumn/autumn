import type {
	AttachDiscount,
	BillingBehavior,
	CancelAction,
	CustomizePlanLicense,
	ProductItem,
} from "@autumn/shared";
import {
	anchorOverridesFrom,
	type FieldReaders,
	freeTrialFromRequest,
	overridesFromRequest,
	readArray,
	readBoolean,
	readEnum,
	readNumber,
	readQuantities,
	readStampedArray,
	requestRecord,
	trialOverridesFrom,
} from "@/components/forms/shared/utils/requestBodyOverrideHelpers";
import type { UpdateSubscriptionForm } from "../updateSubscriptionFormSchema";

const UPDATE_FIELD_READERS: FieldReaders<UpdateSubscriptionForm> = {
	addLicenses: readArray<CustomizePlanLicense>("upsert_licenses"),
	billingBehavior: readEnum<BillingBehavior>("billing_behavior"),
	cancelAction: readEnum<CancelAction>("cancel_action"),
	discounts: readStampedArray<AttachDiscount>("discounts", "seeded-discount"),
	items: readArray<ProductItem>("items"),
	licenseQuantities: readQuantities("license_quantities", "license_plan_id"),
	noBillingChanges: readBoolean("no_billing_changes"),
	prepaidOptions: readQuantities("options", "feature_id"),
	version: readNumber("version"),
	refundAmount: readEnum<"prorated" | "full">("refund_last_payment"),
	refundBehavior: (request) =>
		typeof request.refund_last_payment === "string" ? "refund" : undefined,
	resetUsage: (request) =>
		requestRecord(request.carry_over_usages)?.enabled === false
			? true
			: undefined,
};

/** Inverse of the update-subscription request builder. Stage-scoped keys
 * (invoice*) are skipped — the review stage re-collects them. */
export const updateSubscriptionFormOverridesFromRequestBody = (
	request: Record<string, unknown>,
): Partial<UpdateSubscriptionForm> => ({
	...overridesFromRequest(request, UPDATE_FIELD_READERS),
	...anchorOverridesFrom(request.billing_cycle_anchor),
	...trialOverridesFrom(freeTrialFromRequest(request), { removable: true }),
});
