import { MetadataType, ms } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { hasStripeInvoicePayment } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { cancelDeferredCreatedSubscription } from "./cancelDeferredCreatedSubscription";
import { expirePendingCustomerProducts } from "./expirePendingCustomerProducts";

// Pending rows are inserted after the metadata row; a void that lands in between
// must not delete the metadata, so the cron re-checks shortly instead.
const RECHECK_DELAY_MS = ms.minutes(10);

/**
 * A voided invoice with no payment can no longer be paid, so the deferred plan waiting
 * on it expires now. Legacy invoice-checkout metadata keeps its cron cleanup.
 */
export const expirePendingForVoidedStripeInvoice = async ({
	ctx,
	stripeInvoice,
	customerId,
}: {
	ctx: AutumnContext;
	stripeInvoice: Stripe.Invoice;
	customerId?: string;
}): Promise<boolean> => {
	const metadata = await MetadataService.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: stripeInvoice.id,
		type: MetadataType.DeferredInvoice,
	});
	if (!metadata) return false;

	if (hasStripeInvoicePayment(stripeInvoice)) {
		ctx.logger.info(
			`[expirePendingForVoidedStripeInvoice] Keeping pending plan for voided invoice ${stripeInvoice.id} with a payment`,
		);
		return false;
	}

	const expiredCount = await expirePendingCustomerProducts({
		ctx,
		metadataId: metadata.id,
	});

	if (expiredCount === 0) {
		await MetadataService.update({
			db: ctx.db,
			id: metadata.id,
			updates: { expires_at: Date.now() + RECHECK_DELAY_MS },
		});
		return false;
	}

	await cancelDeferredCreatedSubscription({
		ctx,
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
		metadata,
		stripeInvoice,
	});

	await MetadataService.delete({ db: ctx.db, id: metadata.id });

	if (customerId) {
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "expirePendingForVoidedStripeInvoice",
		});
	}

	ctx.logger.info(
		`[expirePendingForVoidedStripeInvoice] Expired ${expiredCount} pending plan(s) for voided invoice ${stripeInvoice.id}`,
	);
	return true;
};
