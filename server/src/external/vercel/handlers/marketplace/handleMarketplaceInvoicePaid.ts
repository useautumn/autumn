import { type AppEnv, AttachScenario, type Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";

export const handleMarketplaceInvoicePaid = async ({
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
	const {
		installationId,
		invoiceId,
		externalInvoiceId,
		invoiceTotal,
		invoiceDate,
	} = payload;

	logger.info("💰 marketplace.invoice.paid webhook received", {
		vercelInvoiceId: invoiceId,
		stripeInvoiceId: externalInvoiceId,
		amount: invoiceTotal,
		installationId,
	});

	const stripeCli = createStripeCli({ org, env });

	// 1. Get the invoice
	const invoice = await stripeCli.invoices.retrieve(externalInvoiceId, {
		expand: ["subscription"],
	});

	logger.info("Retrieved Stripe invoice", {
		invoiceId: invoice.id,
		status: invoice.status,
		amountDue: invoice.amount_due / 100,
	});

	// 2. Check if already paid
	if (invoice.status === "paid") {
		logger.info("Invoice already marked as paid, skipping");
		return;
	}

	console.log(
		"invoice.lines.data",
		JSON.stringify(invoice.lines.data, null, 4),
	);

	// 3. Get subscription and payment method
	const subscription = await stripeCli.subscriptions.retrieve(
		invoice.lines.data.find(
			(l) =>
				l.parent?.subscription_item_details?.subscription !== null &&
				l.parent?.subscription_item_details?.subscription !== undefined,
		)?.parent?.subscription_item_details?.subscription as string,
	);

	console.log("subscription", JSON.stringify(subscription, null, 4));

	const customPaymentMethod = await stripeCli.paymentMethods.retrieve(
		subscription.default_payment_method as string,
	);

	logger.info("Found custom payment method", {
		paymentMethodId: customPaymentMethod.id,
		type: customPaymentMethod.type,
	});

	// 4. Create cus_product BEFORE reporting payment
	// This ensures the user gets access to the product when payment is confirmed
	// and the invoice.paid webhook can find the cus_product
	logger.info("Creating customer product before reporting payment");

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

		await createFullCusProduct({
			db,
			attachParams: attachToInsertParams(
				{
					customer,
					products: [product],
					prices: product.prices,
					entitlements: product.entitlements,
					entities: customer.entities || [],
					org,
					stripeCli,
					now: Date.now(),
					paymentMethod: null,
					freeTrial: null,
					optionsList: [],
					cusProducts: customer.customer_products || [],
					replaceables: [],
					features: await FeatureService.list({
						db,
						orgId: org.id,
						env,
					}),
				},
				product,
			),
			subscriptionIds: [subscription.id],
			scenario: AttachScenario.New,
			logger,
		});

		logger.info("✅ Customer product created", {
			productId: product.id,
			customerId: customer.id,
		});
	} catch (error: any) {
		logger.error("❌ Failed to create customer product", {
			error: error.message,
		});
		// Continue anyway - we still need to report payment
	}

	// 5. Report successful payment to Stripe via Payment Records API
	// This marks the payment as "guaranteed" and allows Stripe to mark the invoice as paid
	logger.info("Reporting guaranteed payment to Stripe");

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

	logger.info("✅ Payment reported to Stripe", {
		paymentRecordId: paymentRecord.id,
	});

	// 6. Attach payment record to invoice
	try {
		await stripeCli.invoices.attachPayment(externalInvoiceId, {
			payment_record: paymentRecord.id,
		});

		logger.info("✅ Payment record attached to invoice", {
			invoiceId: externalInvoiceId,
			paymentRecordId: paymentRecord.id,
		});
	} catch (error: any) {
		// Might already be attached from handleInvoicePaymentAttemptRequired
		if (error.code === "resource_already_exists") {
			logger.info("Payment record already attached to invoice");
		} else {
			throw error;
		}
	}

	logger.info(
		"🎉 Vercel payment confirmed - invoice paid, subscription active",
	);
};
