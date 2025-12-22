import type { FullCusProduct } from "@autumn/shared";
import { msToSeconds, orgToCurrency } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice";
import type { SubscriptionUpdateInvoiceAction } from "../typesOld";

/**
 * Execute invoice creation and finalization for subscription updates.
 */
export const executeInvoiceAction = async ({
	ctx,
	invoiceAction,
	stripeCustomerId,
	stripeSubscriptionId,
	customerProduct,
}: {
	ctx: AutumnContext;
	invoiceAction: SubscriptionUpdateInvoiceAction;
	stripeCustomerId: string;
	stripeSubscriptionId: string;
	customerProduct: FullCusProduct;
}) => {
	if (!invoiceAction.shouldCreateInvoice) {
		ctx.logger.info("No invoice creation required");
		return null;
	}

	const { db, org, logger, env } = ctx;
	const stripeClient = createStripeCli({ org, env });

	logger.info(`Creating ${invoiceAction.invoiceItems.length} invoice items`);

	for (const invoiceItem of invoiceAction.invoiceItems) {
		const amountCents = Math.round(invoiceItem.amountDollars * 100);

		logger.info(
			`Creating invoice item: ${invoiceItem.description} - $${invoiceItem.amountDollars} (${amountCents} cents)`,
		);

		await stripeClient.invoiceItems.create({
			customer: stripeCustomerId,
			amount: amountCents,
			currency: orgToCurrency({ org }),
			description: invoiceItem.description,
			subscription: stripeSubscriptionId,
			period: {
				start: msToSeconds(invoiceItem.periodStartEpochMs),
				end: msToSeconds(invoiceItem.periodEndEpochMs),
			},
		});
	}

	if (invoiceAction.shouldChargeImmediately) {
		logger.info("Finalizing and charging invoice immediately");

		const { invoice: finalizedStripeInvoice } = await createAndFinalizeInvoice({
			stripeCli: stripeClient,
			stripeCusId: stripeCustomerId,
			stripeSubId: stripeSubscriptionId,
			paymentMethod: invoiceAction.paymentMethod || null,
			chargeAutomatically: true,
			logger,
		});

		try {
			const parsedInvoiceItems = await getInvoiceItems({
				stripeInvoice: finalizedStripeInvoice,
				prices: invoiceAction.customerPrices.map(
					(customerPrice) => customerPrice.price,
				),
				logger,
			});

			await InvoiceService.createInvoiceFromStripe({
				db,
				stripeInvoice: finalizedStripeInvoice,
				internalCustomerId: customerProduct.internal_customer_id!,
				internalEntityId: customerProduct.internal_entity_id,
				productIds: [customerProduct.product_id],
				internalProductIds: [customerProduct.internal_product_id],
				org,
				sendRevenueEvent: true,
				items: parsedInvoiceItems,
			});

			logger.info("Successfully created internal invoice record");
		} catch (error) {
			logger.error(`Failed to create internal invoice record: ${error}`);
		}

		return finalizedStripeInvoice;
	}

	logger.info("Invoice items created, finalization skipped");
	return null;
};
