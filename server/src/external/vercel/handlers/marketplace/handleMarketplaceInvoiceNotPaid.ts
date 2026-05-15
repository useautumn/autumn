import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { isFirstSubscriptionInvoice } from "@/external/stripe/invoices/utils/classifyStripeInvoice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { ProductService } from "@/internal/products/ProductService.js";
import { VercelResourceService } from "../../services/VercelResourceService.js";

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
	const { installationId, invoiceId, externalInvoiceId, invoiceDate } = payload;

	const { db, org, env, logger } = ctx;

	const stripeCli = createStripeCli({ org, env });

	// 1. Get the invoice
	const invoice = await stripeCli.invoices.retrieve(externalInvoiceId, {
		expand: ["subscription"],
	});

	// 2. Check if already paid
	if (invoice.status === "paid") {
		logger.info("Invoice already marked as not paid, skipping");
		return;
	}

	// 3. Get subscription
	const subscription = await stripeCli.subscriptions.retrieve(
		invoice.lines.data.find(
			(l) =>
				l.parent?.subscription_item_details?.subscription !== null &&
				l.parent?.subscription_item_details?.subscription !== undefined,
		)?.parent?.subscription_item_details?.subscription as string,
	);

	let customPaymentMethod: Stripe.PaymentMethod | null = null;

	try {
		const partialCustomer = await CusService.getByStripeId({
			ctx,
			stripeId: invoice.customer as string,
		});

		if (!partialCustomer) {
			logger.error("Customer not found for payment", {
				stripeCustomerId: invoice.customer,
			});
			throw new Error("Customer not found");
		}

		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: partialCustomer.internal_id,
		});

		if (!customer) {
			logger.error("Customer not found", {
				internalCustomerId: partialCustomer.internal_id,
			});
			throw new Error("Customer not found");
		}

		// Resolve custom payment method (sub default PM may be null for
		// default_incomplete subs — fall back to the customer's Vercel custom PM).
		const pmId =
			(subscription.default_payment_method as string | null) ??
			customer.processors?.vercel?.custom_payment_method_id ??
			null;
		if (pmId) {
			customPaymentMethod = await stripeCli.paymentMethods.retrieve(pmId);
		}

		const vercelBillingPlanId = subscription.metadata?.vercel_billing_plan_id;
		if (!vercelBillingPlanId) {
			logger.error("No vercel_billing_plan_id in subscription metadata");
			throw new Error("Missing vercel_billing_plan_id");
		}

		const vercelResourceId = subscription.metadata?.vercel_resource_id;
		if (vercelResourceId?.startsWith("vre_")) {
			await VercelResourceService.update({
				db,
				resourceId: vercelResourceId,
				installationId,
				orgId: org.id,
				env,
				updates: {
					status: "suspended",
				},
			});
		}

		// If this is the first invoice for the subscription and it failed, expire the
		// optimistically-provisioned cus_product so the customer falls back to the default plan.
		// Renewals are handled by Stripe dunning + customer.subscription.deleted webhook.
		if (isFirstSubscriptionInvoice(invoice)) {
			const existingCusProducts = await customerProductRepo.getByStripeSubId({
				db,
				stripeSubId: subscription.id,
				orgId: org.id,
				env,
			});

			if (existingCusProducts.length > 0) {
				await customerProductActions.expireAndActivateDefault({
					ctx,
					customerProduct: existingCusProducts[0],
					fullCustomer: customer,
				});
			}
		}

		const product = await ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: vercelBillingPlanId,
		});

		if (!product) {
			logger.error("Product not found", {
				billingPlanId: vercelBillingPlanId,
			});
			throw new Error("Product not found");
		}
	} catch (error: any) {
		logger.error("❌ Failed to create customer product", {
			error: error.message,
		});
		// Continue anyway - we still need to report payment
	}

	if (!customPaymentMethod) {
		throw new Error(
			"Cannot resolve custom payment method for failed-invoice payment record",
		);
	}

	// 5. Report failed payment to Stripe via Payment Records API
	// This marks the payment as "failed" and allows Stripe to mark the invoice as not paid
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
		outcome: "failed",
		failed: {
			failed_at: Math.floor(Date.now() / 1000),
		},
	});

	// 6. Attach payment record to invoice
	let invoiceLikelyPaid = false;
	try {
		await stripeCli.invoices.attachPayment(externalInvoiceId, {
			payment_record: paymentRecord.id,
		});
	} catch (error: any) {
		if (error.code === "resource_already_exists") {
			// Already attached from handleMarketplaceInvoicePaid race
		} else if (
			typeof error?.message === "string" &&
			error.message.includes(
				"You cannot attach a payment to a draft, paid, or voided invoice",
			)
		) {
			// Race: the paid webhook already transitioned the invoice. The
			// subscription is no longer "failed-first-invoice" — re-check the
			// invoice status and bail out without cancelling a possibly-paid sub.
			invoiceLikelyPaid = true;
			logger.info(
				"Invoice transitioned to paid/voided before failed-payment attach",
				{ data: { externalInvoiceId } },
			);
		} else {
			throw error;
		}
	}

	if (invoiceLikelyPaid) {
		// Re-fetch authoritative invoice state before doing anything destructive.
		const latest = await stripeCli.invoices.retrieve(externalInvoiceId);
		if (latest.status === "paid") {
			logger.info(
				"Skipping subscription cancel — invoice is paid (paid-webhook won the race)",
				{ data: { externalInvoiceId, subscriptionId: subscription.id } },
			);
			return;
		}
		// Otherwise (voided / open) fall through — cancellation is still correct.
	}

	await stripeCli.subscriptions.cancel(subscription.id);
};
