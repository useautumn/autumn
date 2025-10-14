import type Stripe from "stripe";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";

export const createAndFinalizeInvoice = async ({
	stripeCli,
	paymentMethod,
	stripeCusId,
	stripeSubId,
	invoiceItems,
	errorOnPaymentFail = true,
	voidIfFailed = true,
	chargeAutomatically = true,
	logger,
}: {
	stripeCli: Stripe;
	paymentMethod: Stripe.PaymentMethod | null;
	stripeCusId: string;
	stripeSubId: string;
	invoiceItems?: Stripe.InvoiceItemCreateParams[];
	errorOnPaymentFail?: boolean;
	voidIfFailed?: boolean;
	chargeAutomatically?: boolean;
	logger?: any;
}) => {
	const invoice = await stripeCli.invoices.create({
		customer: stripeCusId,
		auto_advance: false,
		subscription: stripeSubId,

		collection_method: chargeAutomatically
			? "charge_automatically"
			: "send_invoice",
		days_until_due: chargeAutomatically ? undefined : 30,
	});

	if (invoiceItems) {
		for (const item of invoiceItems) {
			await stripeCli.invoiceItems.create({
				...item,
				invoice: invoice.id!,
				customer: stripeCusId,
			});
		}
	}

	if (!chargeAutomatically) {
		let finalInvoice = await stripeCli.invoices.retrieve(invoice.id!);
		if (finalInvoice.total <= 0) {
			finalInvoice = await stripeCli.invoices.finalizeInvoice(invoice.id!);
		}
		return { invoice: finalInvoice };
	}

	let finalInvoice = await stripeCli.invoices.finalizeInvoice(invoice.id!, {
		auto_advance: false,
	});

	if (finalInvoice.status === "open") {
		const {
			paid,
			error,
			invoice: paidInvoice,
		} = await payForInvoice({
			stripeCli,
			invoiceId: finalInvoice.id!,
			paymentMethod,
			logger,
			errorOnFail: errorOnPaymentFail,
			voidIfFailed,
		});

		if (paid) {
			finalInvoice = paidInvoice!;
		}
	}

	return { invoice: finalInvoice };
};
