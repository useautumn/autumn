import { invoices } from "@autumn/shared";
import { Marketplace } from "@vercel/sdk/sdk/marketplace.js";
import { eq } from "drizzle-orm";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { storeVercelInvoiceId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import { getVercelSdkServerURL } from "@/external/vercel/misc/vercelSdkOptions.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService.js";
import { upsertInvoiceInCache } from "@/internal/invoices/actions/cache/upsertInvoiceInCache.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

/**
 * Handles Vercel's `marketplace.invoice.refunded` webhook — the only
 * confirmation that money actually moved back.
 *
 * Vercel retries webhook deliveries, so the payload's `amount` can't be
 * accumulated (a retried $20 refund would record $40). Instead we fetch the
 * invoice from Vercel and set `refunded_amount` to its `refundTotal`, which
 * is idempotent across retries while still counting multiple partial refunds.
 * If Vercel can't be reached or returns no total, `refunded_amount` is left
 * untouched rather than guessed.
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

	if (!externalInvoiceId || !vercelInvoiceId) {
		logger.warn("[vercel/marketplace.invoice.refunded] unusable payload", {
			data: { externalInvoiceId, vercelInvoiceId, amount: payload.amount },
		});
		return;
	}

	const customer =
		ctx.fullCustomer ??
		(await CusService.getByVercelId({
			ctx,
			vercelInstallationId: installationId,
		}));
	const accessToken = customer?.processors?.vercel?.access_token;
	if (!accessToken) {
		logger.warn(
			"[vercel/marketplace.invoice.refunded] no Vercel access token for installation",
			{ data: { installationId, externalInvoiceId } },
		);
		return;
	}

	let refundTotal: number | undefined;
	try {
		const marketplace = new Marketplace({
			bearerToken: accessToken,
			serverURL: getVercelSdkServerURL(ctx.testOptions),
		});
		const vercelInvoice = await marketplace.getInvoice({
			integrationConfigurationId: installationId,
			invoiceId: vercelInvoiceId,
		});
		const parsed = Number(vercelInvoice.refundTotal);
		if (vercelInvoice.refundTotal === undefined || !Number.isFinite(parsed)) {
			logger.warn(
				"[vercel/marketplace.invoice.refunded] Vercel invoice has no usable refundTotal",
				{
					data: {
						vercelInvoiceId,
						externalInvoiceId,
						state: vercelInvoice.state,
						refundTotal: vercelInvoice.refundTotal,
					},
				},
			);
		} else {
			refundTotal = parsed;
		}
	} catch (error) {
		// Rethrow so the router answers non-2xx and Vercel redelivers; acking
		// here would silently drop the only confirmation that money moved.
		logCaughtError({
			logger,
			message:
				"[vercel/marketplace.invoice.refunded] failed to fetch invoice from Vercel; not acking so Vercel retries",
			error,
			data: { vercelInvoiceId, externalInvoiceId, installationId },
			level: "warn",
		});
		throw error;
	}

	if (refundTotal !== undefined) {
		const [updated] = await db
			.update(invoices)
			.set({ refunded_amount: refundTotal })
			.where(eq(invoices.stripe_id, externalInvoiceId))
			.returning({ id: invoices.id });

		if (!updated) {
			logger.warn("[vercel/marketplace.invoice.refunded] no Autumn invoice", {
				data: { externalInvoiceId },
			});
			return;
		}
	}

	const invoice = await InvoiceService.getByStripeId({
		db,
		stripeId: externalInvoiceId,
	});
	if (invoice && customer?.id) {
		await upsertInvoiceInCache({
			ctx,
			customerId: customer.id,
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
