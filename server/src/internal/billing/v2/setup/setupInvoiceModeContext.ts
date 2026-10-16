import type {
	AttachParamsV1,
	FullCustomer,
	InvoiceMode,
	MultiAttachParamsV0,
	SubscriptionInvoiceTerms,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleInvoiceModeEmailErrors } from "@/internal/billing/v2/common/errors/handleInvoiceModeEmailErrors";
import { handleInvoiceModeIssueMethodErrors } from "@/internal/billing/v2/common/errors/handleInvoiceModeIssueMethodErrors";
import { invoiceModeParamsToIssueMethod } from "@/internal/billing/v2/utils/invoiceMode/invoiceModeIssueMethod";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";

export const setupInvoiceModeContext = async ({
	ctx,
	fullCustomer,
	params,
	stripeCustomer,
	subscriptionInvoiceTerms,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: UpdateSubscriptionV1Params | AttachParamsV1 | MultiAttachParamsV0;
	stripeCustomer?: Stripe.Customer;
	/** The changed send_invoice subscription's terms, kept when its change is drafted or finalized. */
	subscriptionInvoiceTerms?: SubscriptionInvoiceTerms;
}): Promise<InvoiceMode | undefined> => {
	handleInvoiceModeIssueMethodErrors({ params });
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
	const issueMethod = invoiceModeParamsToIssueMethod({
		invoiceModeParams: params.invoice_mode,
	});
	const keptTerms =
		issueMethod === "send" ? undefined : subscriptionInvoiceTerms;
	return {
		finalizeInvoice: issueMethod !== "draft",
		issueMethod,
		enableProductImmediately: params.invoice_mode.enable_plan_immediately,
		footer: template?.footer,
		memo: template?.memo,
		daysUntilDue:
			net_terms_days ??
			template?.net_terms_days ??
			keptTerms?.daysUntilDue ??
			ctx.org.config.default_invoice_net_terms_days ??
			undefined,
		paymentMethodTypes:
			payment_method_types ??
			keptTerms?.paymentMethodTypes ??
			ctx.org.config.allowed_payment_methods ??
			undefined,
	};
};
