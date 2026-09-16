import type { FullProduct, Invoice, LineItem } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mergeStripeMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/mergeStripeMetadata";
import {
	addStripeInvoiceLines,
	createStripeInvoice,
	finalizeStripeInvoice,
} from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { storeInvoiceLineItems } from "@/internal/billing/v2/workflows/storeInvoiceLineItems/storeInvoiceLineItems";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { upsertInvoiceFromStripe } from "../../upsertFromStripe";
import type { InvoiceLine } from "../compute/computeInvoiceLines";
import type { StripeInvoicePlan } from "../evaluate/evaluateStripeInvoicePlan";
import type { CreateInvoiceContext } from "../setup/setupCreateInvoiceContext";

const ADD_LINES_BATCH_SIZE = 100;

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
}): Promise<{ invoice: Invoice; dueDateMs: number | null }> => {
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
		throw new RecaseError({
			message: `Invoice ${finalized.id} could not be stored`,
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	// Stored inline: the response reports the invoice's line items.
	const billingLineItems: LineItem[] = lines.map((line) => line.lineItem);
	await storeInvoiceLineItems({
		ctx,
		payload: {
			orgId: ctx.org.id,
			env: ctx.env,
			stripeInvoiceId: finalized.id,
			autumnInvoiceId: autumnInvoice.id,
			billingLineItems,
		},
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		source: "createInvoice",
	});

	return {
		invoice: autumnInvoice,
		dueDateMs: finalized.due_date ? finalized.due_date * 1000 : null,
	};
};
