import type { OrgConfig } from "../../models/orgModels/orgConfig.js";

export const ORG_SETTINGS_LABELS = {
	cancel_on_past_due: "Cancel on past due",
	reverse_deduction_order: "Reverse deduction order",
	block_overdue_entitlements: "Block access while overdue",
	invoice_memos: "Invoice memos",
	disable_overage_billing: "Disable overage billing",
	persist_free_overage: "Pay down overages",
	automatic_tax: "Automatic tax",
	multi_currency: "Multi-currency",
} as const satisfies Partial<Record<keyof OrgConfig, string>>;

export type OrgSettingKey = keyof typeof ORG_SETTINGS_LABELS;

export const ORG_SETTING_KEYS = Object.keys(
	ORG_SETTINGS_LABELS,
) as OrgSettingKey[];
