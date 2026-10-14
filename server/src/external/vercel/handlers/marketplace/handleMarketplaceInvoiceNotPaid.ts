import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getInvoiceSubscriptionId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import { ensureVercelInvoiceModeSubscription } from "@/external/vercel/misc/vercelStripeInvoiceMode.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

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

	await ensureVercelInvoiceModeSubscription({
		ctx,
		stripeCli,
		subscription,
	});

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

	try {
		await stripeCli.subscriptions.cancel(subscription.id);
	} catch (error: any) {
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
