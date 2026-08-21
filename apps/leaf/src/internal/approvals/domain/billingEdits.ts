import {
	AttachParamsV1Schema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import { z } from "zod";

export const EDITABLE_BILLING_TOOLS = ["attach", "updateSubscription"] as const;
export type EditableBillingTool = (typeof EDITABLE_BILLING_TOOLS)[number];

/** The three operator decisions on a billing write: how the customer pays,
 * whether access starts before payment settles, and how proration lands. */
export const billingEditsSchema = z.strictObject({
	access: z.enum(["immediate", "after_payment"]),
	billing: z.enum([
		"charge_directly",
		"checkout",
		"draft_invoice",
		"finalized_invoice",
	]),
	proration: z.enum(["immediate", "next_cycle"]),
});

export type BillingEdits = z.infer<typeof billingEditsSchema>;

/** Checkout is an attach-only flow; updates charge the existing payment
 * method or invoice instead. */
export const billingOptionsFor = (
	toolName: EditableBillingTool,
): ReadonlyArray<BillingEdits["billing"]> =>
	toolName === "attach"
		? ["checkout", "draft_invoice", "finalized_invoice"]
		: ["charge_directly", "draft_invoice", "finalized_invoice"];

const getRecord = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export const billingEditsFromRequest = ({
	request,
	toolName,
}: {
	request: Record<string, unknown>;
	toolName: EditableBillingTool;
}): BillingEdits => {
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
			: toolName === "attach"
				? "checkout"
				: "charge_directly",
		// An omitted proration resolves server-side from
		// org.config.bill_upgrade_immediately, which defaults to immediate.
		proration:
			request.proration_behavior === "none" ? "next_cycle" : "immediate",
	};
};

export const applyBillingEdits = ({
	edits,
	request,
	toolName,
}: {
	edits: BillingEdits;
	request: Record<string, unknown>;
	toolName: EditableBillingTool;
}) => {
	const {
		enable_plan_immediately: _enablePlanImmediately,
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
		edits.proration !==
			billingEditsFromRequest({ request, toolName }).proration;
	const invoiceMode = getRecord(existingInvoiceMode);
	const invoiceUpdates =
		edits.billing === "checkout"
			? { long_lived_checkout: true, redirect_mode: "always" }
			: edits.billing === "charge_directly"
				? { redirect_mode: "if_required" }
				: {
						invoice_mode: {
							...invoiceMode,
							enable_plan_immediately: enablePlanImmediately,
							enabled: true,
							finalize: edits.billing === "finalized_invoice",
						},
						redirect_mode: "if_required",
					};
	const updated = {
		...unchanged,
		// Provisioning is attach-only at the top level; updates carry it inside
		// invoice_mode alone.
		...(toolName === "attach"
			? { enable_plan_immediately: enablePlanImmediately }
			: {}),
		...(writeProration
			? {
					proration_behavior:
						edits.proration === "immediate" ? "prorate_immediately" : "none",
				}
			: {}),
		...invoiceUpdates,
	};

	return toolName === "attach"
		? AttachParamsV1Schema.safeParse(updated)
		: UpdateSubscriptionV1ParamsSchema.safeParse(updated);
};
