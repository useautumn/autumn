import {
	type AppEnv,
	AttachScenario,
	type FeatureOptions,
	type Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { sendUsageAndReset } from "@/external/stripe/webhookHandlers/handleInvoiceCreated/handleInvoiceCreated.js";
import { parseVercelPrepaidQuantities } from "@/external/vercel/misc/vercelInvoicing.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";

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

	// 1. Get the invoice
	const invoice = await stripeCli.invoices.retrieve(externalInvoiceId, {
		expand: ["subscription"],
	});

	// 2. Check if already paid
	if (invoice.status === "paid") {
		logger.info("Invoice already marked as paid, skipping");
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

		const product = await ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: vercelBillingPlanId,
		});

		if (!product) {
			throw new Error("Product not found");
		}

		// Check if this is a renewal (cus_product already exists for this subscription)
		const existingCusProducts = await CusProductService.getByStripeSubId({
			db,
			stripeSubId: subscription.id,
			orgId: org.id,
			env,
		});

		const isRenewal = existingCusProducts.length > 0;

		// Fetch Vercel resource by ID from subscription metadata
		let optionsList: FeatureOptions[] = [];
		const vercelResourceId = subscription.metadata?.vercel_resource_id;

		if (vercelResourceId?.startsWith("vre_")) {
			try {
				const resource = await VercelResourceService.getById({
					db,
					resourceId: vercelResourceId,
					orgId: org.id,
					env,
				});

				if (resource?.metadata && Object.keys(resource.metadata).length > 0) {
					optionsList = parseVercelPrepaidQuantities({
						metadata: resource.metadata,
						product,
						prices: product.prices,
					});
				}

				await VercelResourceService.update({
					db,
					resourceId: vercelResourceId,
					installationId,
					orgId: org.id,
					env,
					updates: {
						status: "ready",
					},
				});
			} catch (error: any) {
				logger.warn("Could not fetch or parse resource metadata", {
					error: error.message,
					resourceId: vercelResourceId,
				});
				// Continue with empty optionsList
			}
		}

		if (isRenewal) {
			const activeProduct = existingCusProducts[0];

			await sendUsageAndReset({
				db,
				activeProduct,
				org,
				env,
				invoice,
				logger,
				submitUsage: false, // Usage already submitted in invoice.created
				resetBalance: true, // Payment confirmed - now safe to reset balance
			});
		} else {
			// New subscription - create cus_product
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
						optionsList,
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
		}
	} catch (error: any) {
		logger.error("❌ Failed to create customer product", {
			error: error.message,
		});
		// Continue anyway - we still need to report payment
	}

	// 5. Report successful payment to Stripe via Payment Records API
	// This marks the payment as "guaranteed" and allows Stripe to mark the invoice as paid
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

	// 6. Attach payment record to invoice
	try {
		await stripeCli.invoices.attachPayment(externalInvoiceId, {
			payment_record: paymentRecord.id,
		});
	} catch (error: any) {
		// Might already be attached from handleInvoicePaymentAttemptRequired
		if (error.code === "resource_already_exists") {
			logger.info("Payment record already attached to invoice");
		} else {
			throw error;
		}
	}
};
