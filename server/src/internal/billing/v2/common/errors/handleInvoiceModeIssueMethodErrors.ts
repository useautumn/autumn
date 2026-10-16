import { ErrCode, type InvoiceModeParams, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** issue_method only shapes an invoice-mode invoice; without invoice mode the card is charged now. */
export const handleInvoiceModeIssueMethodErrors = ({
	params,
}: {
	params: { invoice_mode?: InvoiceModeParams };
}) => {
	const invoiceMode = params.invoice_mode;
	if (invoiceMode?.issue_method === undefined) return;
	if (invoiceMode.enabled === true) return;

	throw new RecaseError({
		message:
			"issue_method requires invoice_mode.enabled: true. Without invoice mode the card is charged immediately.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
