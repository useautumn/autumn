export type BillingBadge = { active: boolean; label: string };

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/** The billing action's notable on/off options, as fixed badges — highlighted
 * when true, dimmed (opposite) when false. Reads the write tool's params. */
export const billingActionBadges = (
	params?: Record<string, unknown> | null,
): BillingBadge[] => {
	const invoiceMode = asRecord(params?.invoice_mode);
	const invoiceOn =
		params?.invoice_mode === true || invoiceMode.enabled === true;
	const enableImmediately =
		invoiceMode.enable_plan_immediately === true ||
		params?.enable_plan_immediately === true;

	return [
		{ active: invoiceOn, label: "Invoice mode" },
		{ active: enableImmediately, label: "Enable immediately" },
		{ active: params?.proration_behavior !== "none", label: "Prorations" },
	];
};
