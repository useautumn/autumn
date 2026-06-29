import type { CustomerBillingControlsParams } from "@autumn/shared";
import type { BillingControls } from "../../../compose/models/billingControlModels.js";

export function transformBillingControlsToApi(
	controls: BillingControls | undefined,
): CustomerBillingControlsParams | undefined {
	if (!controls) return undefined;

	const result: CustomerBillingControlsParams = {};

	if (controls.autoTopups?.length) {
		result.auto_topups = controls.autoTopups.map((autoTopup) => ({
			feature_id: autoTopup.featureId,
			...(autoTopup.enabled !== undefined
				? { enabled: autoTopup.enabled }
				: {}),
			threshold: autoTopup.threshold,
			quantity: autoTopup.quantity,
			...(autoTopup.purchaseLimit
				? {
						purchase_limit: {
							interval: autoTopup.purchaseLimit.interval,
							...(autoTopup.purchaseLimit.intervalCount !== undefined
								? {
										interval_count: autoTopup.purchaseLimit.intervalCount,
									}
								: {}),
							limit: autoTopup.purchaseLimit.limit,
						},
					}
				: {}),
			...(autoTopup.invoiceMode !== undefined
				? { invoice_mode: autoTopup.invoiceMode }
				: {}),
		}));
	}

	if (controls.spendLimits?.length) {
		result.spend_limits = controls.spendLimits.map((spendLimit) => ({
			...(spendLimit.featureId !== undefined
				? { feature_id: spendLimit.featureId }
				: {}),
			...(spendLimit.enabled !== undefined
				? { enabled: spendLimit.enabled }
				: {}),
			...(spendLimit.limitType !== undefined
				? { limit_type: spendLimit.limitType }
				: {}),
			...(spendLimit.overageLimit !== undefined
				? { overage_limit: spendLimit.overageLimit }
				: {}),
		}));
	}

	if (controls.usageLimits?.length) {
		result.usage_limits = controls.usageLimits.map((usageLimit) => ({
			feature_id: usageLimit.featureId,
			...(usageLimit.enabled !== undefined
				? { enabled: usageLimit.enabled }
				: {}),
			limit: usageLimit.limit,
			interval: usageLimit.interval,
		}));
	}

	if (controls.usageAlerts?.length) {
		result.usage_alerts = controls.usageAlerts.map((usageAlert) => ({
			...(usageAlert.featureId !== undefined
				? { feature_id: usageAlert.featureId }
				: {}),
			...(usageAlert.enabled !== undefined
				? { enabled: usageAlert.enabled }
				: {}),
			threshold: usageAlert.threshold,
			threshold_type: usageAlert.thresholdType,
			...(usageAlert.name !== undefined ? { name: usageAlert.name } : {}),
		}));
	}

	if (controls.overageAllowed?.length) {
		result.overage_allowed = controls.overageAllowed.map((overageAllowed) => ({
			feature_id: overageAllowed.featureId,
			...(overageAllowed.enabled !== undefined
				? { enabled: overageAllowed.enabled }
				: {}),
		}));
	}

	return Object.keys(result).length > 0 ? result : undefined;
}
