import type { BillingControlKey } from "@autumn/shared";
import type { SheetType } from "@/hooks/stores/useSheetStore";

export const BILLING_CONTROL_ADD_SHEETS: Record<BillingControlKey, SheetType> =
	{
		auto_topups: "billing-auto-topup-add",
		spend_limits: "billing-spend-limit-add",
		usage_limits: "billing-usage-limit-add",
		usage_alerts: "billing-usage-alert-add",
		overage_allowed: "billing-overage-allowed-add",
	};

export const BILLING_CONTROL_EDIT_SHEETS: Record<BillingControlKey, SheetType> =
	{
		auto_topups: "billing-auto-topup-edit",
		spend_limits: "billing-spend-limit-edit",
		usage_limits: "billing-usage-limit-edit",
		usage_alerts: "billing-usage-alert-edit",
		overage_allowed: "billing-overage-allowed-edit",
	};

export const BILLING_CONTROL_LABELS: Record<BillingControlKey, string> = {
	auto_topups: "Auto Top-up",
	spend_limits: "Spend Limit",
	usage_limits: "Usage Limit",
	usage_alerts: "Usage Alert",
	overage_allowed: "Overage Allowed",
};
