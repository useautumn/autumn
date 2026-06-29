import type { CustomerBillingControlsParams } from "@autumn/shared";
import type { BillingControls } from "../../../compose/models/billingControlModels.js";

export function transformApiBillingControls(
	api: CustomerBillingControlsParams | null | undefined,
): BillingControls | undefined {
	if (!api) return undefined;

	const result: BillingControls = {};

	if (api.auto_topups?.length) {
		result.autoTopups = api.auto_topups.map((autoTopup) => ({
			featureId: autoTopup.feature_id,
			...(autoTopup.enabled !== undefined
				? { enabled: autoTopup.enabled }
				: {}),
			threshold: autoTopup.threshold,
			quantity: autoTopup.quantity,
			...(autoTopup.purchase_limit
				? {
						purchaseLimit: {
							interval: autoTopup.purchase_limit.interval,
							...(autoTopup.purchase_limit.interval_count !== undefined
								? {
										intervalCount: autoTopup.purchase_limit.interval_count,
									}
								: {}),
							limit: autoTopup.purchase_limit.limit,
						},
					}
				: {}),
			...(autoTopup.invoice_mode !== undefined
				? { invoiceMode: autoTopup.invoice_mode }
				: {}),
		}));
	}

	if (api.spend_limits?.length) {
		result.spendLimits = api.spend_limits.map((spendLimit) => ({
			...(spendLimit.feature_id !== undefined
				? { featureId: spendLimit.feature_id }
				: {}),
			...(spendLimit.enabled !== undefined
				? { enabled: spendLimit.enabled }
				: {}),
			...(spendLimit.limit_type !== undefined
				? { limitType: spendLimit.limit_type }
				: {}),
			...(spendLimit.overage_limit !== undefined
				? { overageLimit: spendLimit.overage_limit }
				: {}),
		}));
	}

	if (api.usage_limits?.length) {
		result.usageLimits = api.usage_limits.map((usageLimit) => ({
			featureId: usageLimit.feature_id,
			...(usageLimit.enabled !== undefined
				? { enabled: usageLimit.enabled }
				: {}),
			limit: usageLimit.limit,
			interval: usageLimit.interval,
		}));
	}

	if (api.usage_alerts?.length) {
		result.usageAlerts = api.usage_alerts.map((usageAlert) => ({
			...(usageAlert.feature_id !== undefined
				? { featureId: usageAlert.feature_id }
				: {}),
			...(usageAlert.enabled !== undefined
				? { enabled: usageAlert.enabled }
				: {}),
			threshold: usageAlert.threshold,
			thresholdType: usageAlert.threshold_type,
			...(usageAlert.name !== undefined ? { name: usageAlert.name } : {}),
		}));
	}

	if (api.overage_allowed?.length) {
		result.overageAllowed = api.overage_allowed.map((overageAllowed) => ({
			featureId: overageAllowed.feature_id,
			...(overageAllowed.enabled !== undefined
				? { enabled: overageAllowed.enabled }
				: {}),
		}));
	}

	return Object.keys(result).length > 0 ? result : undefined;
}
