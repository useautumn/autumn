import { AttachParamsV1Schema } from "@autumn/shared/publicApiSchemas";
import { z } from "zod";

/** The two operator decisions on an attach: how the customer pays (one
 * billing mode) and whether access starts before payment settles. */
export const attachBillingEditsSchema = z.strictObject({
	access: z.enum(["immediate", "after_payment"]),
	billing: z.enum(["checkout", "draft_invoice", "finalized_invoice"]),
	proration: z.enum(["immediate", "next_cycle"]),
});

export type AttachBillingEdits = z.infer<typeof attachBillingEditsSchema>;

const getRecord = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export const attachBillingEditsFromRequest = (
	request: Record<string, unknown>,
): AttachBillingEdits => {
	const invoiceMode = getRecord(request.invoice_mode);
	const invoiceEnabled =
		request.invoice_mode === true || invoiceMode.enabled === true;
	const immediate =
		typeof request.enable_plan_immediately === "boolean"
			? request.enable_plan_immediately
			: invoiceMode.enable_plan_immediately === true;

	return {
		access: immediate ? "immediate" : "after_payment",
		billing: invoiceEnabled
			? invoiceMode.finalize === false
				? "draft_invoice"
				: "finalized_invoice"
			: "checkout",
		// An omitted proration resolves server-side from
		// org.config.bill_upgrade_immediately, which defaults to immediate.
		proration:
			request.proration_behavior === "none" ? "next_cycle" : "immediate",
	};
};

export const applyAttachBillingEdits = ({
	edits,
	request,
}: {
	edits: AttachBillingEdits;
	request: Record<string, unknown>;
}) => {
	const {
		invoice_mode: existingInvoiceMode,
		long_lived_checkout: _longLivedCheckout,
		proration_behavior: _prorationBehavior,
		redirect_mode: _redirectMode,
		...unchanged
	} = request;
	const enablePlanImmediately = edits.access === "immediate";
	// Only an explicit choice writes the field: a request that never carried
	// proration_behavior keeps the org default (and stays valid for brand-new
	// subscriptions, which reject "none").
	const writeProration =
		"proration_behavior" in request ||
		edits.proration !== attachBillingEditsFromRequest(request).proration;
	const invoiceMode = getRecord(existingInvoiceMode);
	const updated = {
		...unchanged,
		enable_plan_immediately: enablePlanImmediately,
		...(writeProration
			? {
					proration_behavior:
						edits.proration === "immediate" ? "prorate_immediately" : "none",
				}
			: {}),
		...(edits.billing === "checkout"
			? { long_lived_checkout: true, redirect_mode: "always" }
			: {
					invoice_mode: {
						...invoiceMode,
						enable_plan_immediately: enablePlanImmediately,
						enabled: true,
						finalize: edits.billing === "finalized_invoice",
					},
					redirect_mode: "if_required",
				}),
	};

	return AttachParamsV1Schema.safeParse(updated);
};
