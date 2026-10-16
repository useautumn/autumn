import { type ApprovalAction, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { invoiceToFacts } from "@/internal/approvals/facts/invoices/invoiceToFacts";
import { CusService } from "@/internal/customers/CusService";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { checkRouteApproval } from "./checkRouteApproval";

/** An action on an existing invoice, judged on its total and, for a credit, the amount credited. */
export const checkInvoiceApproval = ({
	ctx,
	action,
	invoiceId,
	refundAmount,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
	invoiceId: string;
	refundAmount?: number;
}) =>
	checkRouteApproval({
		ctx,
		action,
		buildFacts: async () => {
			const row = await InvoiceService.getListRowById({ ctx, id: invoiceId });
			if (!row) {
				throw new RecaseError({
					message: `Invoice ${invoiceId} not found`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			const fullCustomer = await CusService.getFull({
				ctx,
				idOrInternalId: row.customer_id ?? row.invoice.internal_customer_id,
			});
			return invoiceToFacts({
				fullCustomer,
				invoice: row.invoice,
				refundAmount,
			});
		},
	});
