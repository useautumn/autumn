import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	isFirstSubscriptionInvoice,
	isStripeInvoiceForNewPeriod,
} from "@/external/stripe/invoices/utils/classifyStripeInvoice.js";
import { sendUsageAndReset } from "@/external/stripe/webhookHandlers/handleInvoiceCreated/handleInvoiceCreated.js";
import { getInvoiceSubscriptionId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

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
	const { installationId, invoiceId, externalInvoiceId, invoiceDate } = payload;

	const stripeCli = createStripeCli({ org, env });

	const invoice = await stripeCli.invoices.retrieve(externalInvoiceId, {
		expand: ["subscription"],
	});

	if (invoice.status === "paid") {
		logger.info("Invoice already marked as paid, skipping");
		return;
	}

	const subscriptionId = getInvoiceSubscriptionId(invoice);

	let customPaymentMethod: Stripe.PaymentMethod | null = null;

	if (subscriptionId) {
		const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);

		try {
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

			// Resolve custom payment method. Prefer the sub's default PM if set,
			// otherwise fall back to the customer's Vercel-bound custom PM.
			// V2's `default_incomplete` flow does NOT persist the PM to the sub,
			// so the fallback is the normal path.
			const pmId =
				(subscription.default_payment_method as string | null) ??
				customer.processors?.vercel?.custom_payment_method_id ??
				null;
			if (!pmId) {
				throw new Error(
					"Cannot resolve custom payment method for Vercel invoice (no sub default PM and no customer custom PM)",
				);
			}
			customPaymentMethod = await stripeCli.paymentMethods.retrieve(pmId);

			const vercelBillingPlanId = subscription.metadata?.vercel_billing_plan_id;
			if (!vercelBillingPlanId) {
				logger.error("No vercel_billing_plan_id in subscription metadata");
				throw new Error("Missing vercel_billing_plan_id");
			}

			const vercelResourceId = subscription.metadata?.vercel_resource_id;

			// Update resource status to "ready" (covers cases where resource was provisioned async)
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
					logger.warn(`Could not update resource status to ready: ${error}`, {
						data: { resourceId: vercelResourceId },
					});
				}
			}

			if (isFirstSubscriptionInvoice(invoice)) {
				// First invoice for this subscription. The cus_product should already exist
				// (created on resource creation), but provision idempotently as a safety net.
				const stripeCustomer = await stripeCli.customers.retrieve(
					customer.processor.id,
					{ expand: ["subscriptions"] },
				);
				if (stripeCustomer.deleted) {
					throw new Error("Stripe customer is deleted");
				}

				// Fetch resource metadata for prepaid quantity parsing, if any
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
						logger.warn(`Could not fetch resource metadata: ${error}`, {
							data: { resourceId: vercelResourceId },
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
				// Renewal — reset balances, submit usage if needed
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
			logger.error("❌ Failed to handle Vercel invoice paid", {
				error: error.message,
			});
		}
	} else {
		const partialCustomer = await CusService.getByStripeId({
			ctx,
			stripeId: invoice.customer as string,
		});

		const customPmId =
			partialCustomer?.processors?.vercel?.custom_payment_method_id;

		if (!customPmId) {
			logger.error(
				"[handleMarketplaceInvoicePaid] No subscription on invoice and no Vercel custom PM on customer; cannot report payment",
				{
					data: {
						externalInvoiceId,
						stripeCustomerId: invoice.customer,
					},
				},
			);
			throw new Error(
				"Cannot resolve payment method for non-subscription Vercel invoice",
			);
		}

		customPaymentMethod = await stripeCli.paymentMethods.retrieve(customPmId);
	}

	if (!customPaymentMethod) {
		throw new Error("Failed to resolve custom payment method");
	}

	const paymentRecord = await stripeCli.paymentRecords.reportPayment({
		amount_requested: {
			value: invoice.amount_due,
			currency: invoice.currency,
		},
		payment_method_details: {
			payment_method: customPaymentMethod.id,
		},
		customer_details: {
			customer: invoice.customer as string,
		},
		initiated_at: Math.floor(new Date(invoiceDate).getTime() / 1000),
		customer_presence: "off_session",
		processor_details: {
			type: "custom",
			custom: {
				payment_reference: invoiceId,
			},
		},
		outcome: "guaranteed",
		guaranteed: {
			guaranteed_at: Math.floor(Date.now() / 1000),
		},
	});

	try {
		await stripeCli.invoices.attachPayment(externalInvoiceId, {
			payment_record: paymentRecord.id,
		});
	} catch (error: any) {
		if (error.code === "resource_already_exists") {
			logger.info("Payment record already attached to invoice");
		} else if (
			typeof error?.message === "string" &&
			error.message.includes(
				"You cannot attach a payment to a draft, paid, or voided invoice",
			)
		) {
			// Race with Vercel marketplace: invoice transitioned to paid/voided
			// before we attached our payment record. The payment is already
			// recorded by some other path — log and continue.
			logger.info("Invoice transitioned to paid/voided before attach", {
				data: { externalInvoiceId },
			});
		} else {
			throw error;
		}
	}
};
