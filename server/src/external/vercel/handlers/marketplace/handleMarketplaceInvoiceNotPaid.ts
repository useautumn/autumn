import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getInvoiceSubscriptionId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import { ensureVercelInvoiceModeSubscription } from "@/external/vercel/misc/vercelStripeInvoiceMode.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

/**
 * Handles Vercel's `marketplace.invoice.notpaid` webhook.
 *
 * Replaces the legacy Custom Payment Method + Payment Records "report failed
 * payment" flow. Vercel marketplace already failed to collect; we just clean
 * up Autumn-side and cancel the Stripe subscription so the customer loses
 * access. The invoice itself is left in its current Stripe status (not paid)
 * — the Stripe ledger reflects the failure naturally.
 *
 * - Does NOT call `stripeCli.paymentRecords.reportPayment`.
 * - Does NOT call `stripeCli.invoices.attachPayment`.
 * - Sets the Vercel resource to `suspended`.
 * - Expires the Autumn customer product and activates the default fallback.
 * - Cancels the Stripe subscription.
 */
export const handleMarketplaceInvoiceNotPaid = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: {
		installationId: string;
		invoiceId: string;
		externalInvoiceId: string;
		invoiceTotal: string;
		period: { start: string; end: string };
		invoiceDate: string;
	};
}) => {
	const { db, org, env, logger } = ctx;
	const { installationId, externalInvoiceId } = payload;

	const stripeCli = createStripeCli({ org, env });

	const invoice = await stripeCli.invoices.retrieve(externalInvoiceId, {
		expand: ["subscription"],
	});

	// If the paid webhook already won the race, do nothing destructive.
	if (invoice.status === "paid") {
		logger.info("Invoice already marked as paid; skipping notpaid cleanup", {
			data: { externalInvoiceId },
		});
		return;
	}

	const subscriptionId = getInvoiceSubscriptionId(invoice);

	if (!subscriptionId) {
		logger.warn(
			"[handleMarketplaceInvoiceNotPaid] No subscription on invoice; nothing to cancel",
			{ data: { externalInvoiceId } },
		);
		return;
	}

	const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);

	// Lazy migration before destructive ops — keeps state consistent for any
	// downstream observers that read collection_method.
	await ensureVercelInvoiceModeSubscription({
		ctx,
		stripeCli,
		subscription,
	});

	// Resolve customer for cus_product cleanup. Failure is logged but doesn't
	// block the destructive cleanup below (we still want the resource
	// suspended + sub canceled even if our DB lookup misfires).
	let customerInternalId: string | undefined;
	try {
		const partialCustomer = await CusService.getByStripeId({
			ctx,
			stripeId: invoice.customer as string,
		});
		if (partialCustomer) {
			customerInternalId = partialCustomer.internal_id;
		} else {
			logger.warn("[handleMarketplaceInvoiceNotPaid] Customer not found", {
				data: { stripeCustomerId: invoice.customer },
			});
		}
	} catch (error: any) {
		logCaughtError({
			logger,
			message: "[vercel/marketplace.invoice.notpaid] Customer lookup failed",
			error,
			data: { stripeCustomerId: invoice.customer },
		});
	}

	// Suspend the Vercel resource so the end user loses access in Vercel's UI.
	const vercelResourceId = subscription.metadata?.vercel_resource_id;
	if (vercelResourceId?.startsWith("vre_")) {
		try {
			await VercelResourceService.update({
				db,
				resourceId: vercelResourceId,
				installationId,
				orgId: org.id,
				env,
				updates: { status: "suspended" },
			});
		} catch (error: any) {
			logCaughtError({
				logger,
				message:
					"[vercel/marketplace.invoice.notpaid] Could not suspend resource",
				error,
				data: { resourceId: vercelResourceId },
				level: "warn",
			});
		}
	}

	// Expire the Autumn cus_product and activate the default fallback. This
	// mirrors the legacy first-invoice failure path but runs for renewals
	// too — payment failed at any point means the customer should lose paid
	// access.
	if (customerInternalId) {
		try {
			const fullCustomer = await CusService.getFull({
				ctx,
				idOrInternalId: customerInternalId,
			});
			if (fullCustomer) {
				const existingCusProducts =
					await customerProductRepo.getByStripeSubId({
						db,
						stripeSubId: subscription.id,
						orgId: org.id,
						env,
					});

				if (existingCusProducts.length > 0) {
					await customerProductActions.expireAndActivateDefault({
						ctx,
						customerProduct: existingCusProducts[0],
						fullCustomer,
					});
				} else {
					logger.info(
						"[handleMarketplaceInvoiceNotPaid] No cus_product to expire",
						{ data: { subscriptionId: subscription.id } },
					);
				}
			}
		} catch (error: any) {
			logCaughtError({
				logger,
				message:
					"[vercel/marketplace.invoice.notpaid] Failed to expire cus_product",
				error,
				data: {
					customerInternalId,
					subscriptionId: subscription.id,
				},
			});
		}
	}

	// Cancel the Stripe subscription. We deliberately do NOT mark the invoice
	// paid — Vercel reported it as unpaid, so the Stripe ledger should keep
	// reflecting that.
	try {
		await stripeCli.subscriptions.cancel(subscription.id);
	} catch (error: any) {
		// `resource_missing` means the sub is already gone — fine, idempotent.
		if (error?.code === "resource_missing") {
			logger.info(
				"[handleMarketplaceInvoiceNotPaid] Subscription already canceled",
				{ data: { subscriptionId: subscription.id } },
			);
			return;
		}
		logCaughtError({
			logger,
			message:
				"[vercel/marketplace.invoice.notpaid] Failed to cancel subscription",
			error,
			data: { subscriptionId: subscription.id },
		});
		throw error;
	}
};
