import {
	type AttachParamsV1,
	ErrCode,
	type FullCustomer,
	type InvoiceMode,
	type MultiAttachParamsV0,
	RecaseError,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleInvoiceModeEmailErrors } from "@/internal/billing/v2/common/errors/handleInvoiceModeEmailErrors";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";

export const setupInvoiceModeContext = async ({
	ctx,
	fullCustomer,
	params,
	stripeCustomer,
	allowApplyToAutoTopups = false,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: UpdateSubscriptionV1Params | AttachParamsV1 | MultiAttachParamsV0;
	stripeCustomer?: Stripe.Customer;
	allowApplyToAutoTopups?: boolean;
}): Promise<InvoiceMode | undefined> => {
	if (
		params?.invoice_mode?.apply_to_auto_topups !== undefined &&
		!allowApplyToAutoTopups
	) {
		throw new RecaseError({
			message:
				"invoice_mode.apply_to_auto_topups is only supported on billing.update when invoice_mode is the only change.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
	if (params?.invoice_mode?.enabled !== true) {
		return undefined;
	}
	handleInvoiceModeEmailErrors({ fullCustomer, stripeCustomer });
	const { invoice_template_id, net_terms_days, payment_method_types } =
		params.invoice_mode;
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
		daysUntilDue:
			net_terms_days ??
			template?.net_terms_days ??
			ctx.org.config.default_invoice_net_terms_days ??
			undefined,
		paymentMethodTypes:
			payment_method_types ??
			ctx.org.config.allowed_payment_methods ??
			undefined,
	};
};
