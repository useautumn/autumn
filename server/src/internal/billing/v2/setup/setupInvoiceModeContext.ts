import {
	type AttachParamsV1,
	type FullCustomer,
	type InvoiceMode,
	InvoicePaymentMethodSchema,
	type MultiAttachParamsV0,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleInvoiceModeEmailErrors } from "@/internal/billing/v2/common/errors/handleInvoiceModeEmailErrors";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";

type InvoiceModeParams = NonNullable<
	(
		| UpdateSubscriptionV1Params
		| AttachParamsV1
		| MultiAttachParamsV0
	)["invoice_mode"]
>;

/** A change to a send_invoice subscription is invoiced like its renewals, on the subscription's own terms, and applies now. */
const inheritedInvoiceMode = (
	stripeSubscription?: Stripe.Subscription,
): InvoiceModeParams | undefined => {
	if (stripeSubscription?.collection_method !== "send_invoice")
		return undefined;
	const paymentMethodTypes =
		stripeSubscription.payment_settings?.payment_method_types?.filter(
			(type) => InvoicePaymentMethodSchema.safeParse(type).success,
		) as InvoiceModeParams["payment_method_types"];

	return {
		enabled: true,
		enable_plan_immediately: true,
		finalize: true,
		net_terms_days: stripeSubscription.days_until_due ?? undefined,
		payment_method_types: paymentMethodTypes?.length
			? paymentMethodTypes
			: undefined,
	};
};

export const setupInvoiceModeContext = async ({
	ctx,
	fullCustomer,
	params,
	stripeCustomer,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: UpdateSubscriptionV1Params | AttachParamsV1 | MultiAttachParamsV0;
	stripeCustomer?: Stripe.Customer;
	/** When the request leaves invoice_mode out, a send_invoice subscription keeps invoicing. */
	stripeSubscription?: Stripe.Subscription;
}): Promise<InvoiceMode | undefined> => {
	const invoiceModeParams =
		params?.invoice_mode ?? inheritedInvoiceMode(stripeSubscription);
	if (invoiceModeParams?.enabled !== true) {
		return undefined;
	}
	handleInvoiceModeEmailErrors({ fullCustomer, stripeCustomer });
	const { invoice_template_id, net_terms_days, payment_method_types } =
		invoiceModeParams;
	const template = invoice_template_id
		? await InvoiceTemplateService.getById({
				db: ctx.db,
				orgId: ctx.org.id,
				id: invoice_template_id,
			})
		: undefined;
	return {
		finalizeInvoice: invoiceModeParams.finalize,
		enableProductImmediately: invoiceModeParams.enable_plan_immediately,
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
