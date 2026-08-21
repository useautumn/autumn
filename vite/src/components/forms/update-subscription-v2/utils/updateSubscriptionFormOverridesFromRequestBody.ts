import type {
	BillingBehavior,
	CancelAction,
	CustomizePlanLicense,
	FreeTrialDuration,
	ProductItem,
} from "@autumn/shared";
import type { FormDiscount } from "@/components/forms/attach-v2/utils/discountUtils";
import {
	anchorOverridesFrom,
	quantityRecordFrom,
	requestRecord,
} from "@/components/forms/shared/utils/requestBodyOverrideHelpers";
import type { UpdateSubscriptionForm } from "../updateSubscriptionFormSchema";

type RequestBody = Record<string, unknown>;

const trialOverridesFrom = (
	value: unknown,
): Partial<UpdateSubscriptionForm> => {
	if (value === null) return { removeTrial: true, trialEnabled: false };
	const trial = requestRecord(value);
	if (!trial || typeof trial.length !== "number") return {};
	return {
		trialCardRequired: trial.card_required !== false,
		trialDuration: (trial.duration ?? "day") as FreeTrialDuration,
		trialEnabled: true,
		trialLength: trial.length,
	};
};

/** Inverse of useUpdateSubscriptionRequestBody's builder: maps a V0 update
 * request into form overrides. Stage-scoped keys (invoice*) are skipped —
 * the review stage re-collects them. */
export const updateSubscriptionFormOverridesFromRequestBody = (
	request: RequestBody,
): Partial<UpdateSubscriptionForm> => {
	const overrides: Partial<UpdateSubscriptionForm> = {};

	const prepaid = quantityRecordFrom(request.options, "feature_id");
	if (Object.keys(prepaid).length) overrides.prepaidOptions = prepaid;
	const licenses = quantityRecordFrom(
		request.license_quantities,
		"license_plan_id",
	);
	if (Object.keys(licenses).length) overrides.licenseQuantities = licenses;
	if (Array.isArray(request.items)) {
		overrides.items = request.items as ProductItem[];
	}
	if (Array.isArray(request.upsert_licenses)) {
		overrides.addLicenses = request.upsert_licenses as CustomizePlanLicense[];
	}
	if (typeof request.version === "number") overrides.version = request.version;
	if (typeof request.billing_behavior === "string") {
		overrides.billingBehavior = request.billing_behavior as BillingBehavior;
	}
	if (typeof request.cancel_action === "string") {
		overrides.cancelAction = request.cancel_action as CancelAction;
	}
	if (typeof request.no_billing_changes === "boolean") {
		overrides.noBillingChanges = request.no_billing_changes;
	}
	if (requestRecord(request.carry_over_usages)?.enabled === false) {
		overrides.resetUsage = true;
	}
	if (typeof request.refund_last_payment === "string") {
		overrides.refundBehavior = "refund";
		overrides.refundAmount = request.refund_last_payment as "prorated" | "full";
	}
	if (Array.isArray(request.discounts)) {
		overrides.discounts = request.discounts.map(
			(discount, index) =>
				({
					...(discount as object),
					_id: `seeded-discount-${index}`,
				}) as FormDiscount,
		);
	}

	return {
		...overrides,
		...anchorOverridesFrom(request.billing_cycle_anchor),
		...trialOverridesFrom(request.free_trial),
	};
};
