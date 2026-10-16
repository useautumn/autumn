import { ErrCode, RecaseError } from "@autumn/shared";
import type { InvoiceFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { buildInvoiceRowFacts } from "./buildInvoiceRowFacts";

/** Facts for an invoice by id. A missing invoice throws the invoice actions' own not-found error. */
export const buildInvoiceFacts = async ({
	ctx,
	invoiceId,
}: {
	ctx: AutumnContext;
	invoiceId: string;
}): Promise<InvoiceFacts> => {
	const row = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	if (!row) {
		throw new RecaseError({
			message: `Invoice ${invoiceId} not found`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return buildInvoiceRowFacts({ ctx, row });
};
