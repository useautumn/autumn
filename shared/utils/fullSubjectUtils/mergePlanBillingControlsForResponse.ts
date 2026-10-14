import type { ApiAutoTopup } from "../../api/billingControls/autoTopup.js";
import type { BillingControlSource } from "../../api/billingControls/billingControlSource.js";
import type { CustomerBillingControlsResponse } from "../../api/billingControls/customerBillingControls.js";
import type { ApiOverageAllowed } from "../../api/billingControls/overageAllowed.js";
import type { ApiSpendLimit } from "../../api/billingControls/spendLimit.js";
import type { ApiUsageAlert } from "../../api/billingControls/usageAlert.js";
import type { ApiUsageLimit } from "../../api/billingControls/usageLimit.js";
import { usageLimitIdentity } from "../../models/cusModels/billingControls/identity/usageLimitIdentity.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { buildNormalizeSpendLimitForCompare } from "./buildNormalizeSpendLimitForCompare.js";
import {
	decorateInheritedPlanUsageLimits,
	mergeControlsByFeature,
} from "./mergeCustomerBillingControlsForCheck.js";
import { getPlanBillingControlProducts } from "./planBillingControlUtils.js";

const tagSource = <T extends { source?: BillingControlSource }>(
	entries: T[],
	source: BillingControlSource,
): T[] => entries.map((entry) => ({ ...entry, source }));

const tagUntaggedAsPlan = <T extends { source?: BillingControlSource }>(
	entries: T[],
): T[] =>
	entries.map((entry) =>
		entry.source ? entry : { ...entry, source: "plan" as const },
	);

const mergePlanUsageAlerts = ({
	customerAlerts,
	planProducts,
}: {
	customerAlerts: ApiUsageAlert[];
	planProducts: FullCusProduct[];
}): ApiUsageAlert[] => {
	const customerFeatureIds = new Set(
		customerAlerts.map((alert) => alert.feature_id ?? ""),
	);
	const featureOwnerProductId = new Map<string, string>();
	const planAlerts: ApiUsageAlert[] = [];

	for (const planProduct of planProducts) {
		for (const alert of planProduct.product?.usage_alerts ?? []) {
			const featureKey = alert.feature_id ?? "";
			if (customerFeatureIds.has(featureKey)) continue;

			const owner = featureOwnerProductId.get(featureKey);
			if (owner === undefined) {
				featureOwnerProductId.set(featureKey, planProduct.id);
			} else if (owner !== planProduct.id) {
				continue;
			}
			planAlerts.push({ ...alert, source: "plan" });
		}
	}

	return [...customerAlerts, ...planAlerts];
};

export const mergePlanBillingControlsForResponse = ({
	billingControls,
	planCustomerProducts = [],
	fullSubject,
	features,
}: {
	billingControls: CustomerBillingControlsResponse;
	planCustomerProducts?: FullCusProduct[];
	fullSubject?: FullSubject;
	features?: Feature[];
}): CustomerBillingControlsResponse => {
	const preserveEmpty = <T>(merged: T[], original: T[] | undefined) =>
		merged.length === 0 ? original : merged;

	const planProducts = getPlanBillingControlProducts({
		customerProducts: planCustomerProducts,
	});

	const usageLimits = tagUntaggedAsPlan(
		decorateInheritedPlanUsageLimits({
			usageLimits: mergeControlsByFeature<ApiUsageLimit, "usage_limits">({
				entityControls: tagSource(
					billingControls.usage_limits ?? [],
					"customer",
				),
				customerControls: [],
				planCustomerProducts: planProducts,
				controlKey: "usage_limits",
				identityOf: usageLimitIdentity,
			}),
			fullSubject,
			features,
		}),
	);

	const spendLimits = tagUntaggedAsPlan(
		mergeControlsByFeature<ApiSpendLimit, "spend_limits">({
			entityControls: tagSource(billingControls.spend_limits ?? [], "customer"),
			customerControls: [],
			planCustomerProducts: planProducts,
			controlKey: "spend_limits",
			normalizeForCompare: fullSubject
				? buildNormalizeSpendLimitForCompare({ fullSubject })
				: undefined,
		}),
	);

	const overageAllowed = tagUntaggedAsPlan(
		mergeControlsByFeature<ApiOverageAllowed, "overage_allowed">({
			entityControls: tagSource(
				billingControls.overage_allowed ?? [],
				"customer",
			),
			customerControls: [],
			planCustomerProducts: planProducts,
			controlKey: "overage_allowed",
		}),
	);

	const autoTopups = tagUntaggedAsPlan(
		mergeControlsByFeature<ApiAutoTopup, "auto_topups">({
			entityControls: tagSource(billingControls.auto_topups ?? [], "customer"),
			customerControls: [],
			planCustomerProducts: planProducts,
			controlKey: "auto_topups",
		}),
	);

	const usageAlerts = mergePlanUsageAlerts({
		customerAlerts: tagSource(billingControls.usage_alerts ?? [], "customer"),
		planProducts,
	});

	return {
		balance_allocations: billingControls.balance_allocations,
		usage_limits: preserveEmpty(usageLimits, billingControls.usage_limits),
		spend_limits: preserveEmpty(spendLimits, billingControls.spend_limits),
		overage_allowed: preserveEmpty(
			overageAllowed,
			billingControls.overage_allowed,
		),
		auto_topups: preserveEmpty(autoTopups, billingControls.auto_topups),
		usage_alerts: preserveEmpty(usageAlerts, billingControls.usage_alerts),
	};
};
