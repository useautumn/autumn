import type { Invoice } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { upsertCachedInvoiceV2 } from "@/internal/customers/cache/fullSubject/index.js";

/**
 * Upsert an invoice in the customer's cached invoices array.
 * Matches by stripe_id — replaces if found, appends if not.
 */
export const upsertInvoiceInCache = async ({
	ctx,
	customerId,
	invoice,
}: {
	ctx: AutumnContext;
	customerId: string;
	invoice: Invoice;
}): Promise<void> => {
	const { logger } = ctx;

	if (!customerId) {
		logger.warn(
			`[upsertInvoiceInCache] Skipping cache update for invoice ${invoice.stripe_id} because customerId is missing`,
		);
		return;
	}

	try {
		await upsertCachedInvoiceV2({
			ctx,
			customerId,
			invoice,
		});
	} catch (error) {
		logger.warn(
			`[upsertInvoiceInCache] FullSubject upsert failed for customer ${customerId}, invoice ${invoice.stripe_id}`,
			error,
		);
	}
};
