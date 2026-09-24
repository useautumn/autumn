import type { FullProduct, Invoice } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { fromUnixTime, getUnixTime } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mergeStripeMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/mergeStripeMetadata";
import {
	addStripeInvoiceLines,
	createStripeInvoice,
	finalizeStripeInvoice,
} from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { storeLineItems } from "@/internal/invoices/lineItems/actions/storeLineItems";
import { upsertInvoiceFromStripe } from "../../upsertFromStripe";
import type { InvoiceLine } from "../compute/computeInvoiceLines";
import type { StripeInvoicePlan } from "../evaluate/evaluateStripeInvoicePlan";
import type { CreateInvoiceContext } from "../setup/setupCreateInvoiceContext";

const ADD_LINES_BATCH_SIZE = 100;

const msToUnixSeconds = (unixMs?: number) =>
	unixMs === undefined ? undefined : getUnixTime(unixMs);

/** Creates, populates and finalizes the Stripe invoice, then mirrors it into Autumn. */
export const executeStripeInvoicePlan = async ({
	ctx,
	invoiceContext,
	lines,
	stripePlan,
}: {
	ctx: AutumnContext;
	invoiceContext: CreateInvoiceContext;
	lines: InvoiceLine[];
	stripePlan: StripeInvoicePlan;
}): Promise<{
	invoice: Invoice;
	issueDateMs: number;
	dueDateMs: number | null;
}> => {
	const { stripeCustomer, fullCustomer, template, currency } = invoiceContext;
	if (!stripeCustomer) {
		throw new RecaseError({
			message: "Customer has no Stripe customer",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const draft = await createStripeInvoice({
		stripeCli,
		stripeCusId: stripeCustomer.id,
		currency,
		collectionMethod: "send_invoice",
		daysUntilDue: invoiceContext.daysUntilDue,
		dueDate: msToUnixSeconds(invoiceContext.params.due_date),
		effectiveAt: msToUnixSeconds(invoiceContext.params.issue_date),
		paymentMethodTypes: ctx.org.config.allowed_payment_methods ?? undefined,
		footer: template?.footer,
		description: template?.memo,
		metadata: mergeStripeMetadata({
			autumnMetadata: {
				autumn_invoice_create: "true",
				autumn_customer_id: fullCustomer.id ?? fullCustomer.internal_id,
			},
		}),
		discounts: stripePlan.invoiceCouponIds.map((coupon) => ({ coupon })),
		defaultTaxRates: invoiceContext.taxRate
			? [invoiceContext.taxRate.id]
			: undefined,
	});

	for (
		let start = 0;
		start < stripePlan.lines.length;
		start += ADD_LINES_BATCH_SIZE
	) {
		await addStripeInvoiceLines({
			stripeCli,
			invoiceId: draft.id,
			lines: stripePlan.lines.slice(start, start + ADD_LINES_BATCH_SIZE),
		});
	}

	const finalized = await finalizeStripeInvoice({
		stripeCli,
		invoiceId: draft.id,
		autoAdvance: true,
	});

	// License lines carry their own product, so derive products from the lines.
	const fullProducts = [
		...new Map(
			lines
				.map((line) => line.lineItem.context.product as FullProduct)
				.filter((product) => Boolean(product.internal_id))
				.map((product) => [product.internal_id, product] as const),
		).values(),
	];
	const autumnInvoice = await upsertInvoiceFromStripe({
		ctx,
		stripeInvoice: finalized,
		fullCustomer,
		fullProducts,
	});
	if (!autumnInvoice) {
		// The Stripe invoice is finalized and payable; nothing here voids it.
		throw new RecaseError({
			message: `Stripe invoice ${finalized.id} was finalized but could not be stored in Autumn; it is open in Stripe and must be reconciled or voided manually`,
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	// Stored inline, not queued: the response reports the invoice's line items.
	await storeLineItems({
		ctx,
		stripeInvoiceId: finalized.id,
		autumnInvoiceId: autumnInvoice.id,
		billingLineItems: lines.map((line) => line.lineItem),
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		source: "createInvoice",
	});

	return {
		invoice: autumnInvoice,
		issueDateMs: fromUnixTime(
			finalized.effective_at ?? finalized.created,
		).getTime(),
		dueDateMs: finalized.due_date
			? fromUnixTime(finalized.due_date).getTime()
			: null,
	};
};
