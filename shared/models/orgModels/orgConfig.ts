import { z } from "zod";

export const OrgConfigSchema = z.object({
	bill_upgrade_immediately: z.boolean().default(true),
	convert_to_charge_automatically: z.boolean().default(true),
	anchor_start_of_month: z.boolean().default(false), // If true, the billing cycle will start on the first day of the month
	cancel_on_past_due: z.boolean().default(false),

	prorate_unused: z.boolean().default(true),

	api_version: z.number().default(0.2),
	checkout_on_failed_payment: z.boolean().default(true), // false for pipeline?
	reverse_deduction_order: z.boolean().default(false),

	include_past_due: z.boolean().default(true),
	// include_check_past_due: z.boolean().default(false),

	sync_status: z.boolean().default(true),
	merge_billing_cycles: z.boolean().default(true),
	multiple_trials: z.boolean().default(false),
	allow_paid_default: z.boolean().default(false),
	cache_customer: z.boolean().default(false),
	invoice_memos: z.boolean().default(false),
});

export type OrgConfig = z.infer<typeof OrgConfigSchema>;
