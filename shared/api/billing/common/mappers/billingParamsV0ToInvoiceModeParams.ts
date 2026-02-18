import type { InvoiceModeParams } from "../invoiceModeParams";

/**
 * Converts V0 billing params invoice fields to V1 InvoiceModeParams.
 */
export const billingParamsV0ToInvoiceModeParams = ({
	input,
}: {
	input: {
		invoice?: boolean;
		enable_product_immediately?: boolean;
		finalize_invoice?: boolean;
	};
}): InvoiceModeParams | undefined => {
	if (!input.invoice) return undefined;

	return {
		enabled: true,
		enable_plan_immediately: input.enable_product_immediately ?? false,
		finalize: input.finalize_invoice ?? true,
	};
};
