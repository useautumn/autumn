import { MetadataType, ms } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { expirePendingCustomerProducts } from "./expirePendingCustomerProducts";

// Pending rows are inserted after the metadata row; a void that lands in between
// must not delete the metadata, so the cron re-checks shortly instead.
const RECHECK_DELAY_MS = ms.minutes(10);

/**
 * A voided invoice can no longer be paid, so the deferred plan waiting on it
 * expires now instead of lingering until the invoice cron reaches `expires_at`.
 * Legacy invoice-checkout metadata keeps its cron cleanup (it also cancels a sub).
 */
export const expirePendingForVoidedStripeInvoice = async ({
	ctx,
	stripeInvoiceId,
	customerId,
}: {
	ctx: AutumnContext;
	stripeInvoiceId: string;
	customerId?: string;
}): Promise<boolean> => {
	const metadata = await MetadataService.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId,
		type: MetadataType.DeferredInvoice,
	});
	if (!metadata) return false;

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

	await MetadataService.delete({ db: ctx.db, id: metadata.id });

	if (customerId) {
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "expirePendingForVoidedStripeInvoice",
		});
	}

	ctx.logger.info(
		`[expirePendingForVoidedStripeInvoice] Expired ${expiredCount} pending plan(s) for voided invoice ${stripeInvoiceId}`,
	);
	return true;
};
