import { invoices } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { storeVercelInvoiceId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { upsertInvoiceInCache } from "@/internal/invoices/actions/cache/upsertInvoiceInCache.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

/**
 * Handles Vercel's `marketplace.invoice.refunded` webhook — the only
 * confirmation that money actually moved back. Increments `refunded_amount`
 * on the Autumn invoice keyed by `externalInvoiceId` (our Stripe invoice id).
 */
export const handleMarketplaceInvoiceRefunded = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: {
		installationId: string;
		invoiceId: string;
		externalInvoiceId: string | null;
		amount: string;
		reason?: string;
	};
}) => {
	const { db, org, env, logger } = ctx;
	const {
		installationId,
		invoiceId: vercelInvoiceId,
		externalInvoiceId,
	} = payload;

	const amount = Number(payload.amount);
	if (!externalInvoiceId || !Number.isFinite(amount) || amount <= 0) {
		logger.warn("[vercel/marketplace.invoice.refunded] unusable payload", {
			data: { externalInvoiceId, amount: payload.amount },
		});
		return;
	}

	const [updated] = await db
		.update(invoices)
		.set({ refunded_amount: sql`${invoices.refunded_amount} + ${amount}` })
		.where(eq(invoices.stripe_id, externalInvoiceId))
		.returning({ id: invoices.id });

	if (!updated) {
		logger.warn("[vercel/marketplace.invoice.refunded] no Autumn invoice", {
			data: { externalInvoiceId },
		});
		return;
	}

	const invoice = await InvoiceService.getByStripeId({
		db,
		stripeId: externalInvoiceId,
	});
	if (invoice && ctx.fullCustomer?.id) {
		await upsertInvoiceInCache({
			ctx,
			customerId: ctx.fullCustomer.id,
			invoice,
		});
	}

	// Backfill the Vercel invoice id for invoices submitted before it was stored.
	try {
		const stripeCli = createStripeCli({ org, env });
		await storeVercelInvoiceId({
			stripeCli,
			stripeInvoiceId: externalInvoiceId,
			vercelInvoiceId,
			installationId,
		});
	} catch (error) {
		logCaughtError({
			logger,
			message:
				"[vercel/marketplace.invoice.refunded] could not stamp vercel_invoice_id",
			error,
			data: { externalInvoiceId },
			level: "warn",
		});
	}
};
