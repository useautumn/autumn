import {
	BILLING_CONTROL_KEYS,
	type CustomerBillingControls,
} from "@autumn/shared";

/** Every lane present as `[]` — catalogV2 treats omitted keys as "keep". */
export const EMPTY_BILLING_CONTROLS: CustomerBillingControls = {
	auto_topups: [],
	spend_limits: [],
	usage_limits: [],
	usage_alerts: [],
	overage_allowed: [],
};

export const toCatalogBillingControls = (
	billingControls?: CustomerBillingControls,
): CustomerBillingControls => {
	const hasAny = BILLING_CONTROL_KEYS.some(
		(key) => (billingControls?.[key]?.length ?? 0) > 0,
	);
	if (!hasAny) return { ...EMPTY_BILLING_CONTROLS };
	return billingControls ?? { ...EMPTY_BILLING_CONTROLS };
};
