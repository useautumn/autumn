import { ErrCode, type InvoiceModeParams, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

const invalidRequest = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});

/**
 * issue_method only shapes an invoice-mode invoice. A silently finalized invoice is never emailed or
 * charged by Stripe, so a plan waiting on its payment would never start; drop the second check to allow it.
 */
export const handleInvoiceModeIssueMethodErrors = ({
	params,
}: {
	params: {
		invoice_mode?: InvoiceModeParams;
		enable_plan_immediately?: boolean;
	};
}) => {
	const invoiceMode = params.invoice_mode;
	if (invoiceMode?.issue_method === undefined) return;

	if (invoiceMode.enabled !== true) {
		throw invalidRequest(
			"issue_method requires invoice_mode.enabled: true. Without invoice mode the card is charged immediately.",
		);
	}

	const waitsForPayment =
		params.enable_plan_immediately !== true &&
		invoiceMode.enable_plan_immediately !== true;
	if (invoiceMode.issue_method === "finalize" && waitsForPayment) {
		throw invalidRequest(
			"issue_method: finalize can't be combined with a plan that waits for payment: Stripe never emails or charges a silently finalized invoice, so the plan would never start. Set enable_plan_immediately: true, or use issue_method: send.",
		);
	}
};
