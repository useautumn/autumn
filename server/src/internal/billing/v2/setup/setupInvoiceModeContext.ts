import type {
	AttachParamsV1,
	InvoiceMode,
	MultiAttachParamsV0,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";

export const setupInvoiceModeContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params | AttachParamsV1 | MultiAttachParamsV0;
}): Promise<InvoiceMode | undefined> => {
	if (params?.invoice_mode?.enabled !== true) {
		return undefined;
	}
	const { invoice_template_id, net_terms_days } = params.invoice_mode;
	const template = invoice_template_id
		? await InvoiceTemplateService.getById({
				db: ctx.db,
				orgId: ctx.org.id,
				id: invoice_template_id,
			})
		: undefined;
	return {
		finalizeInvoice: params.invoice_mode.finalize,
		enableProductImmediately: params.invoice_mode.enable_plan_immediately,
		footer: template?.footer,
		memo: template?.memo,
		daysUntilDue: net_terms_days ?? template?.net_terms_days,
	};
};
