import type { FullProduct, Invoice } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { fromUnixTime, getUnixTime } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mergeStripeMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/mergeStripeMetadata";
import {
	addStripeInvoiceLines,
	createStripeInvoice,
} from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { issueStripeInvoice } from "@/internal/invoices/invoiceUtils/issueStripeInvoice";
import { storeLineItems } from "@/internal/invoices/lineItems/actions/storeLineItems";
import { upsertInvoiceFromStripe } from "../../upsertFromStripe";
import type { InvoiceLine } from "../compute/computeInvoiceLines";
import type { StripeInvoicePlan } from "../evaluate/evaluateStripeInvoicePlan";
import type { CreateInvoiceContext } from "../setup/setupCreateInvoiceContext";

const ADD_LINES_BATCH_SIZE = 100;

/** The entity every plan line bills to, if they all share one; mixed or customer-level invoices stay untagged. */
const invoiceEntityTag = ({ lines }: { lines: InvoiceLine[] }) => {
	const planLineEntityIds = new Set(
		lines
			.filter((line) => line.planKey)
			.map((line) => line.lineItem.context.entity?.internal_id),
	);
	const [only] = planLineEntityIds;
	return planLineEntityIds.size === 1 ? only : undefined;
};

/** Creates and populates the Stripe invoice, issues it per issue_method, then mirrors it into Autumn. */
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
	const { issue_date: issueDate, due_date: dueDate } = invoiceContext.params;
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
		dueDate: dueDate && getUnixTime(dueDate),
		effectiveAt: issueDate && getUnixTime(issueDate),
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

	let populated = draft;
	for (
		let start = 0;
		start < stripePlan.lines.length;
		start += ADD_LINES_BATCH_SIZE
	) {
		populated = await addStripeInvoiceLines({
			stripeCli,
			invoiceId: draft.id,
			lines: stripePlan.lines.slice(start, start + ADD_LINES_BATCH_SIZE),
		});
	}

	const issued = await issueStripeInvoice({
		stripeCli,
		draft: populated,
		issueMethod: invoiceContext.params.issue_method,
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
	const { invoice: autumnInvoice } = await upsertInvoiceFromStripe({
		ctx,
		stripeInvoice: issued,
		fullCustomer,
		fullProducts,
		internalEntityId: invoiceEntityTag({ lines }),
	});
	if (!autumnInvoice) {
		// Nothing here voids or deletes the Stripe invoice.
		throw new RecaseError({
			message: `Stripe invoice ${issued.id} was created but could not be stored in Autumn; it is in Stripe and must be reconciled or voided manually`,
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	// Stored inline, not queued: the response reports the invoice's line items.
	await storeLineItems({
		ctx,
		stripeInvoiceId: issued.id,
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
		issueDateMs: fromUnixTime(issued.effective_at ?? issued.created).getTime(),
		dueDateMs: issued.due_date ? fromUnixTime(issued.due_date).getTime() : null,
	};
};
