// import type { AppEnv, Organization } from "@autumn/shared";
// import type Stripe from "stripe";
// import type { DrizzleCli } from "@/db/initDrizzle.js";
// import { createStripeCli } from "@/external/connect/createStripeCli.js";
// import { CusService } from "@/internal/customers/CusService.js";
// import { ProductService } from "@/internal/products/ProductService.js";
// import type { Logger } from "../../logtail/logtailUtils.js";
// import { Vercel } from "@vercel/sdk";

// /**
//  * Handles invoice.payment_attempt_required webhook
//  *
//  * NOTE: This is ONLY for payment retries/dunning on failed or recurring payments.
//  * For initial Vercel subscription payments, see:
//  *   - handleInvoiceFinalized.ts (submits invoice to Vercel)
//  *   - handleMarketplaceInvoicePaid.ts (processes Vercel payment confirmation)
//  */
// export const handleInvoicePaymentAttemptRequired = async ({
// 	db,
// 	org,
// 	invoice,
// 	env,
// 	logger,
// }: {
// 	db: DrizzleCli;
// 	org: Organization;
// 	invoice: Stripe.Invoice;
// 	env: AppEnv;
// 	logger: Logger;
// 	res?: any;
// }) => {
// 	const stripeCli = createStripeCli({ org, env });

// 	logger.info("📨 invoice.payment_attempt_required webhook received", {
// 		invoiceId: invoice.id,
// 		amountDue: invoice.amount_due / 100,
// 		customerId: invoice.customer,
// 	});

// 	// 1. Validate invoice has outstanding balance
// 	if (invoice.amount_remaining <= 0) {
// 		logger.info("Invoice has no outstanding balance, skipping");
// 		return;
// 	}

// 	// 2. Get subscription to check for custom payment method
// 	if (!invoice.subscription) {
// 		logger.info("No subscription found on invoice, skipping");
// 		return;
// 	}

// 	const subscription = await stripeCli.subscriptions.retrieve(
// 		invoice.subscription as string
// 	);

// 	// 3. Check if this is a Vercel subscription
// 	const vercelInstallationId = subscription.metadata?.vercel_installation_id;
// 	if (!vercelInstallationId) {
// 		logger.info("Not a Vercel subscription, skipping");
// 		return;
// 	}

// 	logger.info("Detected Vercel subscription", {
// 		subscriptionId: subscription.id,
// 		installationId: vercelInstallationId,
// 	});

// 	// 4. Get customer
// 	const customer = await CusService.getByVercelId({
// 		db,
// 		vercelInstallationId,
// 		orgId: org.id,
// 		env,
// 	});

// 	if (!customer) {
// 		logger.error("Customer not found for Vercel installation", {
// 			vercelInstallationId,
// 		});
// 		return;
// 	}

// 	// 5. Get payment method details
// 	const customPaymentMethod = await stripeCli.paymentMethods.retrieve(
// 		subscription.default_payment_method as string
// 	);

// 	if (customPaymentMethod.type !== "custom") {
// 		logger.warn("Not a custom payment method, skipping", {
// 			paymentMethodType: customPaymentMethod.type,
// 		});
// 		return;
// 	}

// 	logger.info("Found custom payment method", {
// 		paymentMethodId: customPaymentMethod.id,
// 	});

// 	// 6. Charge Vercel via their API
// 	const accessToken = customer.processors?.vercel?.access_token;
// 	if (!accessToken) {
// 		logger.error("No Vercel access token found");
// 		return;
// 	}

// 	logger.info("Processing payment with Vercel marketplace");

// 	let vercelPaymentSuccess = false;
// 	let vercelPaymentId: string | undefined;

// 	try {
// 		// For test mode, Vercel provides test validation
// 		const isTestMode = env === "sandbox" || env === "development";

// 		// Vercel doesn't have a direct "charge" API
// 		// Instead, we submit the invoice and they handle charging
// 		const vercel = new Vercel({
// 			bearerToken: accessToken,
// 		});

// 		// Get product for invoice submission
// 		const billingPlanId = subscription.metadata.vercel_billing_plan_id;
// 		const product = await ProductService.getFull({
// 			db,
// 			orgId: org.id,
// 			env,
// 			idOrInternalId: billingPlanId,
// 		});

// 		if (!product) {
// 			logger.error("Product not found for Vercel billing plan", { billingPlanId });
// 			throw new Error("Product not found");
// 		}

// 		// Get the line item period (not invoice period which can be same on creation)
// 		const firstLineItem = invoice.lines.data[0];
// 		const periodStart = firstLineItem?.period?.start || invoice.period_start;
// 		const periodEnd = firstLineItem?.period?.end || invoice.period_end;

// 		const result = await vercel.marketplace.submitInvoice({
// 			integrationConfigurationId: vercelInstallationId,
// 			requestBody: {
// 				externalId: invoice.id,
// 				invoiceDate: new Date(invoice.created * 1000),
// 				period: {
// 					start: new Date(periodStart * 1000),
// 					end: new Date(periodEnd * 1000),
// 				},
// 				items: invoice.lines.data.map(line => ({
// 					resourceId: subscription.metadata.vercel_resource_id || "unknown",
// 					billingPlanId: billingPlanId!,
// 					name: line.description || product.name,
// 					amount: (line.amount / 100).toFixed(2),
// 				})),
// 				...(isTestMode && {
// 					test: {
// 						validate: true,
// 						result: "paid", // Auto-mark as paid in test mode
// 					},
// 				}),
// 			},
// 		});

// 		vercelPaymentSuccess = true;
// 		vercelPaymentId = result.invoiceId;

// 		logger.info("✅ Vercel invoice submitted successfully", {
// 			vercelInvoiceId: result.invoiceId,
// 			stripeInvoiceId: invoice.id,
// 		});
// 	} catch (error: any) {
// 		logger.error("❌ Failed to charge Vercel", {
// 			error: error.message,
// 			invoiceId: invoice.id,
// 		});
// 		vercelPaymentSuccess = false;
// 	}

// 	// 7. Create cus_product BEFORE reporting payment (so invoice.paid webhook can find it)
// 	logger.info("Creating customer product before reporting payment");

// 	try {
// 		const product = await ProductService.getFull({
// 			db,
// 			orgId: org.id,
// 			env,
// 			idOrInternalId: subscription.metadata.vercel_billing_plan_id,
// 		});

// 		if (!product) {
// 			logger.error("Product not found", {
// 				billingPlanId: subscription.metadata.vercel_billing_plan_id,
// 			});
// 			throw new Error("Product not found");
// 		}

// 		// Import dynamically to avoid circular deps
// 		const { createFullCusProduct } = await import("@/internal/customers/add-product/createFullCusProduct.js");
// 		const { attachToInsertParams } = await import("@/internal/products/productUtils.js");
// 		const { AttachScenario } = await import("@autumn/shared");

// 		await createFullCusProduct({
// 			db,
// 			attachParams: attachToInsertParams({
// 				customer,
// 				products: [product],
// 				prices: product.prices,
// 				entitlements: product.entitlements,
// 				org,
// 				env,
// 				stripeCli,
// 				now: Date.now(),
// 			}, product),
// 			subscriptionIds: [subscription.id],
// 			scenario: AttachScenario.New,
// 			logger,
// 		});

// 		logger.info("✅ Customer product created", {
// 			productId: product.id,
// 			customerId: customer.id,
// 		});
// 	} catch (error: any) {
// 		logger.error("❌ Failed to create customer product", {
// 			error: error.message,
// 		});
// 		// Continue anyway - we still need to report payment
// 	}

// 	// 8. Report payment to Stripe via Payment Records API
// 	logger.info("Reporting payment to Stripe via Payment Records API");

// 	try {
// 		const paymentRecord = await stripeCli.paymentRecords.reportPayment({
// 			amount_requested: {
// 				value: invoice.amount_remaining,
// 				currency: invoice.currency,
// 			},
// 			payment_method_details: {
// 				payment_method: customPaymentMethod.id,
// 			},
// 			customer_details: {
// 				customer: customer.processor.id,
// 			},
// 			initiated_at: Math.floor(Date.now() / 1000),
// 			customer_presence: "off_session",
// 			processor_details: {
// 				type: "custom",
// 				custom: {
// 					payment_reference: vercelPaymentId || invoice.id,
// 					vercel_installation_id: vercelInstallationId,
// 				},
// 			},
// 			outcome: vercelPaymentSuccess ? "guaranteed" : "failed",
// 			...(vercelPaymentSuccess && {
// 				guaranteed: {
// 					guaranteed_at: Math.floor(Date.now() / 1000),
// 				},
// 			}),
// 			...(!vercelPaymentSuccess && {
// 				failed: {
// 					failed_at: Math.floor(Date.now() / 1000),
// 				},
// 			}),
// 		});

// 		logger.info("Payment record created", {
// 			paymentRecordId: paymentRecord.id,
// 			outcome: vercelPaymentSuccess ? "guaranteed" : "failed",
// 		});

// 		// 8. Attach payment record to invoice
// 		await stripeCli.invoices.attachPayment(invoice.id, {
// 			payment_record: paymentRecord.id,
// 		});

// 		logger.info("✅ Payment record attached to invoice", {
// 			invoiceId: invoice.id,
// 			paymentRecordId: paymentRecord.id,
// 		});

// 		if (vercelPaymentSuccess) {
// 			logger.info("🎉 Vercel payment successful - subscription should now be active");
// 		} else {
// 			logger.warn("⚠️ Vercel payment failed - subscription remains incomplete");
// 		}
// 	} catch (error: any) {
// 		logger.error("❌ Failed to report payment to Stripe", {
// 			error: error.message,
// 			invoiceId: invoice.id,
// 		});
// 	}
// };
