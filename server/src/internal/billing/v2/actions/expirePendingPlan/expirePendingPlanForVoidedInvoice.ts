import { MetadataType } from "@autumn/shared";
import { addMinutes } from "date-fns";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { hasStripeInvoicePayment } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { expirePendingCustomerProducts } from "@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { releaseExpiredPendingPlan } from "./execute/releaseExpiredPendingPlan";

// Pending rows are inserted after the metadata row; a void that lands in between
// must not delete the metadata, so the cron re-checks shortly instead.
const RECHECK_DELAY_MINUTES = 10;

/** A voided or deleted invoice with no payment can never be paid, so its pending plan expires now. */
export const expirePendingPlanForVoidedInvoice = async ({
	ctx,
	stripeInvoice,
	customerId,
}: {
	ctx: AutumnContext;
	stripeInvoice: Stripe.Invoice;
	customerId?: string;
}): Promise<boolean> => {
	// 1. Setup
	const metadata = await MetadataService.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: stripeInvoice.id,
		type: MetadataType.DeferredInvoice,
	});
	if (!metadata || hasStripeInvoicePayment(stripeInvoice)) return false;

	// 2. Expire the plan
	const expiredCount = await expirePendingCustomerProducts({
		ctx,
		metadataId: metadata.id,
	});
	if (expiredCount === 0) {
		await MetadataService.update({
			db: ctx.db,
			id: metadata.id,
			updates: {
				expires_at: addMinutes(Date.now(), RECHECK_DELAY_MINUTES).getTime(),
			},
		});
		return false;
	}

	// 3. Cancel the sub it created
	await releaseExpiredPendingPlan({
		ctx,
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
		metadata,
		stripeInvoice,
	});

	if (customerId) {
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "expirePendingPlanForVoidedInvoice",
		});
	}

	ctx.logger.info(
		`[expirePendingPlanForVoidedInvoice] Expired ${expiredCount} pending plan(s) for voided invoice ${stripeInvoice.id}`,
	);
	return true;
};
