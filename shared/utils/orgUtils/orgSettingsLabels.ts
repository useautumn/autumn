import type { OrgConfig } from "../../models/orgModels/orgConfig.js";

/**
 * The org config flags a config file may state. Both the CLI's `settings`
 * block and the dashboard's toggles read from here, so neither can name a
 * flag the other lacks. Everything not listed is dashboard-only or internal.
 */
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
