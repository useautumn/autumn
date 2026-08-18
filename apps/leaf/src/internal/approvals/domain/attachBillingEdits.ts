import { AttachParamsV1Schema } from "@autumn/shared/publicApiSchemas";
import { z } from "zod";

export const attachBillingEditsSchema = z.strictObject({
	access: z.enum(["immediate", "after_payment"]),
	invoice: z.enum(["disabled", "draft", "finalized"]),
	redirect: z.enum(["never", "if_required", "always"]),
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
		invoice: invoiceEnabled
			? invoiceMode.finalize === false
				? "draft"
				: "finalized"
			: "disabled",
		redirect:
			request.redirect_mode === "always" || request.redirect_mode === "never"
				? request.redirect_mode
				: "if_required",
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
		...unchanged
	} = request;
	const enablePlanImmediately = edits.access === "immediate";
	const invoiceMode = getRecord(existingInvoiceMode);
	const updated = {
		...unchanged,
		enable_plan_immediately: enablePlanImmediately,
		redirect_mode: edits.redirect,
		...(edits.redirect === "never" ? {} : { long_lived_checkout: true }),
		...(edits.invoice === "disabled"
			? {}
			: {
					invoice_mode: {
						...invoiceMode,
						enabled: true,
						enable_plan_immediately: enablePlanImmediately,
						finalize: edits.invoice === "finalized",
					},
				}),
	};

	return AttachParamsV1Schema.safeParse(updated);
};
