import type { Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { hasStripeInvoicePayment } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import { expirePendingCustomerProducts } from "@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { releaseExpiredPendingPlan } from "./execute/releaseExpiredPendingPlan";
import { voidInvoiceAtDueDate } from "./execute/voidInvoiceAtDueDate";

/** A deferred invoice reached its due date: give up the pending plan unless anything was paid. */
export const expirePendingPlanAtDueDate = async ({
	ctx,
	stripeCli,
	metadata,
	stripeInvoice,
}: {
	ctx: RepoContext;
	stripeCli: Stripe;
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
}) => {
	// 1. Any payment keeps the pending plan; stop the cron re-picking it
	if (hasStripeInvoicePayment(stripeInvoice)) {
		await MetadataService.update({
			db: ctx.db,
			id: metadata.id,
			updates: { expires_at: null },
		});
		return;
	}

	// 2. Close the invoice
	const invoiceClosed = await voidInvoiceAtDueDate({
		ctx,
		stripeCli,
		metadata,
		stripeInvoice,
	});
	if (!invoiceClosed) return;

	// 3. Expire the plan, then cancel the sub it created
	await expirePendingCustomerProducts({ ctx, metadataId: metadata.id });
	await releaseExpiredPendingPlan({ ctx, stripeCli, metadata, stripeInvoice });
};
