import type {
  AppEnv,
  FullCusProduct,
  FullCustomerPrice,
  InvoiceStatus,
  Organization,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { handleInvoiceCheckoutPaid } from "@/internal/customers/attach/attachFunctions/invoiceCheckoutPaid/handleInvoiceCheckoutPaid.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { nullish } from "@/utils/genUtils.js";
import {
  getFullStripeInvoice,
  getInvoiceDiscounts,
  invoiceToSubId,
  updateInvoiceIfExists,
} from "../stripeInvoiceUtils.js";
import { lineItemInCusProduct } from "../stripeSubUtils/stripeSubItemUtils.js";
import { getStripeSubs } from "../stripeSubUtils.js";
import { createStripeCli } from "../utils.js";
import { handleInvoicePaidDiscount } from "./handleInvoicePaidDiscount.js";

const handleOneOffInvoicePaid = async ({
	db,
	stripeInvoice,
	logger,
}: {
	db: DrizzleCli;
	stripeInvoice: Stripe.Invoice;
	event: Stripe.Event;
	logger: any;
}) => {
	// Search for invoice
	const invoice = await InvoiceService.getByStripeId({
		db,
		stripeId: stripeInvoice.id!,
	});

	if (!invoice) {
		console.log(`Invoice not found`);
		return;
	}

	// Update invoice status
	await InvoiceService.updateByStripeId({
		db,
		stripeId: stripeInvoice.id!,
		updates: {
			status: stripeInvoice.status as InvoiceStatus,
			hosted_invoice_url: stripeInvoice.hosted_invoice_url,
			discounts: getInvoiceDiscounts({
				expandedInvoice: stripeInvoice,
			}),
		},
	});

	console.log(`Updated one off invoice status to ${stripeInvoice.status}`);
};

const convertToChargeAutomatically = async ({
	org,
	env,
	invoice,
	activeCusProducts,
	logger,
}: {
	org: Organization;
	env: AppEnv;
	invoice: Stripe.Invoice;
	activeCusProducts: FullCusProduct[];
	logger: any;
}) => {
	const stripeCli = createStripeCli({ org, env });

	const subs = await getStripeSubs({
		stripeCli,
		subIds: activeCusProducts.flatMap((p) => p.subscription_ids || []),
	});

	const payments = invoice.payments;
	const firstPayment = payments?.data?.[0];
	const paymentIntentId = firstPayment?.payment?.payment_intent as string;

	if (
		subs.every((s) => s.collection_method === "charge_automatically") ||
		nullish(paymentIntentId)
	) {
		return;
	}

	// Get payment intent...

	// Try to attach payment method to subscription
	try {
		logger.info(`Converting to charge automatically`);
		// 1. Get payment intent
		const paymentIntent =
			await stripeCli.paymentIntents.retrieve(paymentIntentId);

		// 2. Get payment method
		const paymentMethod = await stripeCli.paymentMethods.retrieve(
			paymentIntent.payment_method as string,
		);

		await stripeCli.paymentMethods.attach(paymentMethod.id, {
			customer: invoice.customer as string,
		});

		const batchUpdateSubs = [];
		const updateSub = async (sub: Stripe.Subscription) => {
			try {
				await stripeCli.subscriptions.update(sub.id, {
					collection_method: "charge_automatically",
					default_payment_method: paymentMethod.id,
				});
			} catch (error) {
				logger.warn(
					`Convert to charge automatically: error updating subscription ${sub.id}`,
				);
				logger.warn(error);
			}
		};

		for (const sub of subs) {
			batchUpdateSubs.push(updateSub(sub));
		}

		await Promise.all(batchUpdateSubs);

		logger.info("Convert to charge automatically successful!");
	} catch (error) {
		logger.warn(`Convert to charge automatically failed: ${error}`);
	}
};

export const handleInvoicePaid = async ({
	db,
	req,
	org,
	invoiceData,
	env,
	event,
}: {
	db: DrizzleCli;
	req: any;
	org: Organization;
	invoiceData: Stripe.Invoice;
	env: AppEnv;
	event: Stripe.Event;
}) => {
	const logger = req.logtail;
	const stripeCli = createStripeCli({ org, env });
	const invoice = await getFullStripeInvoice({
		stripeCli,
		stripeId: invoiceData.id!,
		expand: ["payments"],
	});

	if (invoice.metadata?.autumn_metadata_id) {
		await handleInvoiceCheckoutPaid({
			req,
			org,
			env,
			db,
			stripeCli,
			invoice,
		});
	}

	await handleInvoicePaidDiscount({
		db,
		expandedInvoice: invoice,
		org,
		env,
		logger,
	});

	const subId = invoiceToSubId({ invoice });
	if (subId) {
		// Get customer product
		const activeCusProducts = await CusProductService.getByStripeSubId({
			db,
			stripeSubId: subId,
			orgId: org.id,
			env,
		});

		if (!activeCusProducts || activeCusProducts.length === 0) {
			// TODO: Send alert
			if (invoice.livemode) {
				logger.warn(
					`invoice.paid: customer product not found for invoice ${invoice.id}`,
				);
			}
			return;
		}

		if (org.config.convert_to_charge_automatically) {
			await convertToChargeAutomatically({
				org,
				env,
				invoice,
				activeCusProducts,
				logger,
			});
		}

		const updated = await updateInvoiceIfExists({
			db,
			invoice,
		});

		if (!updated) {
			const invoiceItems = await getInvoiceItems({
				stripeInvoice: invoice,
				prices: activeCusProducts.flatMap((p) =>
					p.customer_prices.map((cpr: FullCustomerPrice) => cpr.price),
				),
				logger,
			});

			const invoiceLines = invoice.lines.data;
			let cusProducts: FullCusProduct[] = activeCusProducts;
			try {
				cusProducts = activeCusProducts.filter((cp) =>
					invoiceLines.some((l) =>
						lineItemInCusProduct({ cusProduct: cp, lineItem: l }),
					),
				);

				console.log(
					"Invoice paid, filtered cus products:",
					cusProducts.map((cp) => `${cp.product.name} - ${cp.product.id}`),
				);

				if (cusProducts.length == 0) {
					cusProducts = activeCusProducts;
				}
			} catch (error) {
				logger.error("Failed to filter cus products for invoice");
				logger.error({ error });
			}

			const internalEntityId = new Set(
				cusProducts.map((cp) => cp.internal_entity_id),
			);

			await InvoiceService.createInvoiceFromStripe({
				db,
				stripeInvoice: invoice,
				internalCustomerId: activeCusProducts[0].internal_customer_id,
				internalEntityId:
					internalEntityId.size > 1
						? undefined
						: internalEntityId.values().next().value,

				productIds: [...new Set(cusProducts.map((p) => p.product_id))],
				internalProductIds: [
					...new Set(cusProducts.map((p) => p.internal_product_id)),
				],
				org: org,
				items: invoiceItems,
			});
		}

		for (const cusProd of activeCusProducts) {
			try {
				await addTaskToQueue({
					jobName: JobName.TriggerCheckoutReward,
					payload: {
						customer: cusProd.customer,
						product: cusProd.product,
						org,
						env: cusProd.customer!.env,
						subId: cusProd.subscription_ids?.[0],
					},
				});
			} catch (error) {
				logger.error(`invoice.paid: failed to trigger checkout reward check`);
				logger.error(error);
			}
		}
	} else {
		await handleOneOffInvoicePaid({
			db,
			stripeInvoice: invoice,
			event,
			logger,
		});
	}
};
