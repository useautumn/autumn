import type { AppEnv, Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { VercelResourceService } from "../../services/VercelResourceService.js";

export const handleMarketplaceInvoiceNotPaid = async ({
	db,
	org,
	env,
	logger,
	payload,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	logger: Logger;
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

	// 3. Get subscription and payment method
	const subscription = await stripeCli.subscriptions.retrieve(
		invoice.lines.data.find(
			(l) =>
				l.parent?.subscription_item_details?.subscription !== null &&
				l.parent?.subscription_item_details?.subscription !== undefined,
		)?.parent?.subscription_item_details?.subscription as string,
	);

	const customPaymentMethod = await stripeCli.paymentMethods.retrieve(
		subscription.default_payment_method as string,
	);

	try {
		const partialCustomer = await CusService.getByStripeId({
			db,
			stripeId: invoice.customer as string,
		});

		if (!partialCustomer) {
			logger.error("Customer not found for payment", {
				stripeCustomerId: invoice.customer,
			});
			throw new Error("Customer not found");
		}

		const customer = await CusService.getFull({
			db,
			idOrInternalId: partialCustomer.internal_id,
			orgId: org.id,
			env,
		});

		if (!customer) {
			logger.error("Customer not found", {
				internalCustomerId: partialCustomer.internal_id,
			});
			throw new Error("Customer not found");
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
	try {
		await stripeCli.invoices.attachPayment(externalInvoiceId, {
			payment_record: paymentRecord.id,
		});
	} catch (error: any) {
		// Might already be attached from handleMarketplaceInvoicePaid
		if (error.code === "resource_already_exists") {
		} else {
			throw error;
		}
	}

	await stripeCli.subscriptions.cancel(subscription.id);
};
