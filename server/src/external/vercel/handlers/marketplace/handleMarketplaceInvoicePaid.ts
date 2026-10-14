import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	isFirstSubscriptionInvoice,
	isStripeInvoiceForNewPeriod,
} from "@/external/stripe/invoices/utils/classifyStripeInvoice.js";
import { sendUsageAndReset } from "@/external/stripe/webhookHandlers/handleInvoiceCreated/handleInvoiceCreated.js";
import {
	getInvoiceSubscriptionId,
	getVercelInvoiceId,
	storeVercelInvoiceId,
} from "@/external/vercel/misc/vercelInvoiceUtils.js";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning.js";
import {
	ensureVercelInvoiceModeCustomer,
	ensureVercelInvoiceModeSubscription,
	markVercelInvoicePaidOutOfBand,
} from "@/external/vercel/misc/vercelStripeInvoiceMode.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

export const handleMarketplaceInvoicePaid = async ({
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
	const {
		installationId,
		externalInvoiceId,
		invoiceId: vercelInvoiceId,
	} = payload;

	const stripeCli = createStripeCli({ org, env });

	const invoice = await stripeCli.invoices.retrieve(externalInvoiceId, {
		expand: ["subscription"],
	});

	if (!getVercelInvoiceId(invoice)) {
		await storeVercelInvoiceId({
			stripeCli,
			stripeInvoiceId: invoice.id,
			vercelInvoiceId,
			installationId,
		});
	}

	if (invoice.status === "paid") {
		logger.info("Invoice already marked as paid, skipping");
		return;
	}

	const subscriptionId = getInvoiceSubscriptionId(invoice);

	if (subscriptionId) {
		try {
			const subscription =
				await stripeCli.subscriptions.retrieve(subscriptionId);

			// Lazy migration: legacy onboarders left a CPM as the Stripe
			await ensureVercelInvoiceModeCustomer({
				ctx,
				stripeCli,
				stripeCustomerId: invoice.customer as string,
			});

			await ensureVercelInvoiceModeSubscription({
				ctx,
				stripeCli,
				subscription,
			});

			const partialCustomer = await CusService.getByStripeId({
				ctx,
				stripeId: invoice.customer as string,
			});
			if (!partialCustomer) {
				throw new Error("Customer not found");
			}
			const customer = await CusService.getFull({
				ctx,
				idOrInternalId: partialCustomer.internal_id,
			});
			if (!customer) {
				throw new Error("Customer not found");
			}

			const vercelBillingPlanId = subscription.metadata?.vercel_billing_plan_id;
			if (!vercelBillingPlanId) {
				logger.error("No vercel_billing_plan_id in subscription metadata");
				throw new Error("Missing vercel_billing_plan_id");
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
						updates: { status: "ready" },
					});
				} catch (error) {
					logCaughtError({
						logger,
						message:
							"[vercel/marketplace.invoice.paid] could not update resource status to ready",
						error,
						data: { resourceId: vercelResourceId },
						level: "warn",
					});
				}
			}

			if (isFirstSubscriptionInvoice(invoice)) {
				const stripeCustomer = await stripeCli.customers.retrieve(
					customer.processor.id,
					{ expand: ["subscriptions"] },
				);
				if (stripeCustomer.deleted) {
					throw new Error("Stripe customer is deleted");
				}

				let resourceMetadata: Record<string, any> | undefined;
				if (vercelResourceId?.startsWith("vre_")) {
					try {
						const resource = await VercelResourceService.getById({
							db,
							resourceId: vercelResourceId,
							orgId: org.id,
							env,
						});
						if (
							resource?.metadata &&
							Object.keys(resource.metadata).length > 0
						) {
							resourceMetadata = resource.metadata as Record<string, any>;
						}
					} catch (error) {
						logCaughtError({
							logger,
							message:
								"[vercel/marketplace.invoice.paid] could not fetch resource metadata",
							error,
							data: { resourceId: vercelResourceId },
							level: "warn",
						});
					}
				}

				try {
					await provisionVercelCusProduct({
						ctx,
						customer,
						stripeCustomer,
						stripeCli,
						integrationConfigurationId: installationId,
						billingPlanId: vercelBillingPlanId,
						resourceId: vercelResourceId,
						metadata: resourceMetadata,
					});
				} catch (error: any) {
					if (error?.code === "vercel_provisioning_in_flight") {
						logger.info(
							"invoice.paid safety net skipped — original provision still in flight",
						);
					} else {
						throw error;
					}
				}
			} else if (isStripeInvoiceForNewPeriod(invoice)) {
				const existingCusProducts = await customerProductRepo.getByStripeSubId({
					db,
					stripeSubId: subscription.id,
					orgId: org.id,
					env,
				});

				if (existingCusProducts.length === 0) {
					logger.warn("Renewal invoice but no cus_product found", {
						subscriptionId: subscription.id,
					});
				} else {
					const activeProduct = existingCusProducts[0];
					await sendUsageAndReset({
						ctx,
						activeProduct,
						invoice,
						submitUsage: false,
						resetBalance: true,
					});
				}
			} else {
				logger.warn("Unexpected billing_reason for Vercel invoice", {
					billing_reason: invoice.billing_reason,
					invoiceId: invoice.id,
				});
			}
		} catch (error: any) {
			logCaughtError({
				logger,
				message: "[vercel/marketplace.invoice.paid] FAILED",
				error,
				data: {
					externalInvoiceId,
					installationId,
				},
			});
		}
	}

	await markVercelInvoicePaidOutOfBand({
		ctx,
		stripeCli,
		invoice,
	});
};
