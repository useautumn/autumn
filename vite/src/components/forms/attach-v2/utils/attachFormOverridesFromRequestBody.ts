import type {
	AttachDiscount,
	BillingBehavior,
	CustomizePlanLicense,
	FreeTrialDuration,
	PlanTiming,
	ProductItem,
	TrialOnEnd,
} from "@autumn/shared";
import {
	anchorOverridesFrom,
	quantityRecordFrom,
	requestRecord,
} from "@/components/forms/shared/utils/requestBodyOverrideHelpers";
import type { AttachForm, FormCustomLineItem } from "../attachFormSchema";

type RequestBody = Record<string, unknown>;

const trialOverridesFrom = (value: unknown): Partial<AttachForm> => {
	if (value === null) return { trialEnabled: false };
	const trial = requestRecord(value);
	if (!trial || typeof trial.length !== "number") return {};
	return {
		trialCardRequired: trial.card_required !== false,
		trialDuration: (trial.duration ?? "day") as FreeTrialDuration,
		trialEnabled: true,
		trialLength: trial.length,
		...(trial.on_end === "bill" || trial.on_end === "revert"
			? { trialOnEnd: trial.on_end as TrialOnEnd }
			: {}),
	};
};

const carryOverOverridesFrom = (
	value: unknown,
	overrides: { enabled: keyof AttachForm; featureIds: keyof AttachForm },
): Partial<AttachForm> => {
	const carryOver = requestRecord(value);
	if (!carryOver?.enabled) return {};
	return {
		[overrides.enabled]: true,
		...(Array.isArray(carryOver.feature_ids)
			? { [overrides.featureIds]: carryOver.feature_ids }
			: {}),
	};
};

/** Stage-scoped keys (invoice*, redirect_mode, checkout params) are
 * intentionally skipped — the review stage re-collects them. */
export const attachFormOverridesFromRequestBody = (
	request: RequestBody,
): Partial<AttachForm> => {
	const overrides: Partial<AttachForm> = {};

	if (typeof request.product_id === "string") {
		overrides.productId = request.product_id;
	}
	const prepaid = quantityRecordFrom(request.options, "feature_id");
	if (Object.keys(prepaid).length) overrides.prepaidOptions = prepaid;
	const licenses = quantityRecordFrom(
		request.license_quantities,
		"license_plan_id",
	);
	if (Object.keys(licenses).length) overrides.licenseQuantities = licenses;
	if (Array.isArray(request.items)) {
		overrides.items = request.items as ProductItem[];
		overrides.isCustom = true;
	}
	if (Array.isArray(request.upsert_licenses)) {
		overrides.addLicenses = request.upsert_licenses as CustomizePlanLicense[];
	}
	if (typeof request.version === "number") overrides.version = request.version;
	if (typeof request.billing_behavior === "string") {
		overrides.prorationBehavior = request.billing_behavior as BillingBehavior;
	}
	if (typeof request.plan_schedule === "string") {
		overrides.planSchedule = request.plan_schedule as PlanTiming;
	}
	if (typeof request.starts_at === "number") {
		overrides.startDate = request.starts_at;
	}
	if (typeof request.ends_at === "number") overrides.endDate = request.ends_at;
	if (typeof request.enable_product_immediately === "boolean") {
		overrides.enablePlanImmediately = request.enable_product_immediately;
	}
	if (typeof request.new_billing_subscription === "boolean") {
		overrides.newBillingSubscription = request.new_billing_subscription;
	}
	if (typeof request.no_billing_changes === "boolean") {
		overrides.noBillingChanges = request.no_billing_changes;
	}
	if (typeof request.long_lived_checkout === "boolean") {
		overrides.longLivedCheckout = request.long_lived_checkout;
	}
	if (typeof request.currency === "string") {
		overrides.currency = request.currency;
	}
	if (Array.isArray(request.remove_plan_ids)) {
		overrides.removePlanIds = request.remove_plan_ids.filter(
			(id): id is string => typeof id === "string",
		);
	}
	if (Array.isArray(request.discounts)) {
		overrides.discounts = (request.discounts as AttachDiscount[]).map(
			(discount, index) => ({ ...discount, _id: `seeded-discount-${index}` }),
		);
	}
	if (Array.isArray(request.custom_line_items)) {
		overrides.customLineItems = request.custom_line_items.flatMap(
			(item, index): FormCustomLineItem[] => {
				const lineItem = requestRecord(item);
				return typeof lineItem?.amount === "number" &&
					typeof lineItem.description === "string"
					? [
							{
								_id: `seeded-line-item-${index}`,
								amount: lineItem.amount,
								description: lineItem.description,
							},
						]
					: [];
			},
		);
	}

	return {
		...overrides,
		...anchorOverridesFrom(request.billing_cycle_anchor),
		...carryOverOverridesFrom(request.carry_over_balances, {
			enabled: "carryOverBalances",
			featureIds: "carryOverBalanceFeatureIds",
		}),
		...carryOverOverridesFrom(request.carry_over_usages, {
			enabled: "carryOverUsages",
			featureIds: "carryOverUsageFeatureIds",
		}),
		...trialOverridesFrom(request.free_trial),
	};
};
