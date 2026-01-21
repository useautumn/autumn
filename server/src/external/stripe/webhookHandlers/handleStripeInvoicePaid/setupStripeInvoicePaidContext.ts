import { ALL_STATUSES, cp, type FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import {
	type ExpandedStripeInvoice,
	getStripeInvoice,
} from "@/external/stripe/invoices/operations/getStripeInvoice.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { stripeInvoiceToStripeSubscriptionId } from "../../invoices/utils/convertStripeInvoice";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

export interface StripeInvoicePaidContext {
	stripeInvoice: ExpandedStripeInvoice<["discounts.source.coupon", "payments"]>;
	stripeSubscriptionId?: string;
	customerProducts?: FullCusProduct[];
}

export const setupStripeInvoicePaidContext = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoicePaidEvent;
}): Promise<StripeInvoicePaidContext | null> => {
	const { stripeCli } = ctx;

	const invoiceData = event.data.object;

	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: invoiceData.id!,
		expand: ["discounts.source.coupon", "payments"],
	});

	const stripeSubscriptionId =
		stripeInvoiceToStripeSubscriptionId(stripeInvoice);

	const { fullCustomer } = ctx;

	let customerProducts: FullCusProduct[] | undefined;

	if (fullCustomer && stripeSubscriptionId) {
		customerProducts = await CusProductService.getByStripeSubId({
			db: ctx.db,
			stripeSubId: stripeSubscriptionId,
			orgId: ctx.org.id,
			env: ctx.env,
			inStatuses: ALL_STATUSES,
		});

		fullCustomer.customer_products = customerProducts;
	}

	return {
		stripeInvoice,
		stripeSubscriptionId,
		customerProducts,
	};
};
