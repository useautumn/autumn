export interface RecalculateBalanceEntitlementPreview {
	customer_entitlement_id: string;
	before_remaining: number;
	after_remaining: number;
}

export interface RecalculateBalancePreview {
	total_usage: number;
	entitlements: RecalculateBalanceEntitlementPreview[];
}
