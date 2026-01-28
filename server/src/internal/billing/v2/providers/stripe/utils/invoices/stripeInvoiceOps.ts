import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

// ============================================
// Create Invoice
// ============================================

type CreateInvoiceParams = {
	stripeCli: Stripe;
	stripeCusId: string;
	stripeSubId?: string;
	currency?: string;
	discounts?: { coupon: string }[];
	collectionMethod?: "charge_automatically" | "send_invoice";
	daysUntilDue?: number;
	description?: string;
	metadata?: Stripe.MetadataParam;
};

export const createStripeInvoice = async ({
	stripeCli,
	stripeCusId,
	stripeSubId,
	currency,
	collectionMethod = "charge_automatically",
	daysUntilDue,
	description,
	metadata,
}: CreateInvoiceParams): Promise<Stripe.Invoice> => {
	const invoice = await stripeCli.invoices.create({
		customer: stripeCusId,
		auto_advance: false,
		...(stripeSubId ? { subscription: stripeSubId } : {}),
		...(currency ? { currency } : {}),
		...(description ? { description } : {}),
		...(metadata ? { metadata } : {}),
		collection_method: collectionMethod,
		days_until_due:
			collectionMethod === "send_invoice" ? (daysUntilDue ?? 30) : undefined,
	});

	return invoice;
};

// ============================================
// Add Invoice Lines
// ============================================

type AddInvoiceLinesParams = {
	stripeCli: Stripe;
	invoiceId: string;
	lines: Stripe.InvoiceAddLinesParams.Line[];
};

export const addStripeInvoiceLines = async ({
	stripeCli,
	invoiceId,
	lines,
}: AddInvoiceLinesParams): Promise<Stripe.Invoice> => {
	const invoice = await stripeCli.invoices.addLines(invoiceId, {
		lines,
	});

	return invoice;
};

// ============================================
// Finalize Invoice
// ============================================

type FinalizeInvoiceParams = {
	stripeCli: Stripe;
	invoiceId: string;
	autoAdvance?: boolean;
};

export const finalizeStripeInvoice = async ({
	stripeCli,
	invoiceId,
	autoAdvance = false,
}: FinalizeInvoiceParams): Promise<Stripe.Invoice> => {
	const invoice = await stripeCli.invoices.finalizeInvoice(invoiceId, {
		auto_advance: autoAdvance,
	});

	return invoice;
};

// ============================================
// Create Invoice Items
// ============================================

type CreateStripeInvoiceItemsParams = {
	ctx: AutumnContext;
	invoiceItems: Stripe.InvoiceItemCreateParams[];
};

export const createStripeInvoiceItems = async ({
	ctx,
	invoiceItems,
}: CreateStripeInvoiceItemsParams): Promise<void> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	for (const item of invoiceItems) {
		await stripeCli.invoiceItems.create(item);
	}
};
