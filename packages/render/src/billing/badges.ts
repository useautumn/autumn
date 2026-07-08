import { asRecord } from "../records.js";

export type BillingBadge = { active: boolean; label: string };

const CANCEL_LABELS: Record<string, string> = {
	cancel_immediately: "Cancel now",
	cancel_end_of_cycle: "Cancel at cycle end",
	uncancel: "Uncancel",
};

/** The billing action's notable on/off options, as fixed badges — highlighted
 * when true, dimmed (opposite) when false — plus conditional badges for
 * options that only matter when set (checkout, scheduling, cancels, resets).
 * `explicitOnly` drops the fixed badges whose params the write never set
 * (chat cards: an unset toggle on a cancel is noise, not information). */
export const billingActionBadges = (
	params?: Record<string, unknown> | null,
	{ explicitOnly = false }: { explicitOnly?: boolean } = {},
): BillingBadge[] => {
	const invoiceMode = asRecord(params?.invoice_mode) ?? {};
	const invoiceOn =
		params?.invoice_mode === true || invoiceMode.enabled === true;
	const finalize = invoiceMode.finalize === true;
	const enableImmediately =
		invoiceMode.enable_plan_immediately === true ||
		params?.enable_plan_immediately === true;
	const prorationBehavior =
		params?.proration_behavior ?? params?.billing_behavior;
	const netTermsDays = invoiceMode.net_terms_days;
	const cancelAction =
		typeof params?.cancel_action === "string"
			? CANCEL_LABELS[params.cancel_action]
			: undefined;

	const invoiceDefined = params?.invoice_mode !== undefined;
	const enableDefined =
		invoiceMode.enable_plan_immediately !== undefined ||
		params?.enable_plan_immediately !== undefined;
	const prorationDefined = prorationBehavior !== undefined;

	const badges: BillingBadge[] = [
		...(!explicitOnly || invoiceDefined
			? [
					{
						active: invoiceOn,
						label: invoiceOn && !finalize ? "Invoice (draft)" : "Invoice mode",
					},
				]
			: []),
		...(!explicitOnly || enableDefined
			? [{ active: enableImmediately, label: "Enable immediately" }]
			: []),
		...(!explicitOnly || prorationDefined
			? [{ active: prorationBehavior !== "none", label: "Prorations" }]
			: []),
	];
	if (typeof netTermsDays === "number") {
		badges.push({ active: true, label: `Net ${netTermsDays} days` });
	}
	if (params?.redirect_mode === "always") {
		badges.push({ active: true, label: "Checkout link" });
	}
	if (params?.plan_schedule === "end_of_cycle") {
		badges.push({ active: true, label: "End of cycle" });
	}
	if (params?.no_billing_changes === true) {
		badges.push({ active: true, label: "No billing changes" });
	}
	if (params?.billing_cycle_anchor === "now") {
		badges.push({ active: true, label: "Reset billing cycle" });
	}
	if (params?.recalculate_balances === true) {
		badges.push({ active: true, label: "Reset usage" });
	}
	if (cancelAction) {
		badges.push({ active: true, label: cancelAction });
	}
	return badges;
};
