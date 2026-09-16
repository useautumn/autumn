import { MetadataType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { expirePendingCustomerProducts } from "./expirePendingCustomerProducts";

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

	await expirePendingCustomerProducts({ ctx, metadataId: metadata.id });
	await MetadataService.delete({ db: ctx.db, id: metadata.id });

	if (customerId) {
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "expirePendingForVoidedStripeInvoice",
		});
	}

	ctx.logger.info(
		`[expirePendingForVoidedStripeInvoice] Expired pending plans for voided invoice ${stripeInvoiceId}`,
	);
	return true;
};
