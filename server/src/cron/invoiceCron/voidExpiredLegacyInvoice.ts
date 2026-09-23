import { type Metadata, MetadataType } from "@autumn/shared";
import { addDays } from "date-fns";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { expirePendingCustomerProducts } from "@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts";
import { MetadataService } from "@/internal/metadata/MetadataService";
import type { CronContext } from "../utils/CronContext";
import type { InvoiceCronContext } from "./setupInvoiceCronContext";

/** Pre-deferred-invoice cleanup for invoice-checkout and action-required metadata. */
export const voidExpiredLegacyInvoice = async ({
	ctx,
	invoiceCronContext,
	metadata,
}: {
	ctx: CronContext;
	invoiceCronContext: InvoiceCronContext;
	metadata: Metadata;
}) => {
	const { logger, db } = ctx;
	const { org, customer, stripeCli, stripeInvoice, repoContext } =
		invoiceCronContext;

	const subId = stripeInvoiceToStripeSubscriptionId(stripeInvoice);
	const voidSub = metadata.type === MetadataType.InvoiceCheckout;
	const expirePendingRows = async () => {
		try {
			await expirePendingCustomerProducts({
				ctx: repoContext,
				metadataId: metadata.id,
			});
		} catch (error) {
			logger.error(`Error expiring pending customer products: ${error}`);
		}
	};

	if (stripeInvoice.status === "open") {
		try {
			await stripeCli.invoices.voidInvoice(stripeInvoice.id);
			logger.info(
				`voided invoice ${stripeInvoice.id} for customer ${customer.id} (org: ${org.slug})`,
			);

			if (voidSub && subId) {
				logger.info(`Voiding sub ${subId} [created through invoice checkout]`);
				try {
					await stripeCli.subscriptions.cancel(subId);
				} catch (error) {
					logger.warn(`Error voiding sub ${subId}: ${error}`);
				}
			}

			await expirePendingRows();
			await MetadataService.delete({
				db,
				id: metadata.id,
			});
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes("pending payments waiting to clear")
			) {
				await MetadataService.update({
					db,
					id: metadata.id,
					updates: { expires_at: addDays(Date.now(), 1).getTime() },
				});
				logger.info(
					`Invoice ${stripeInvoice.id} has a pending payment; retrying cleanup in 24 hours`,
				);
				return;
			}

			logger.error(`Error voiding invoice: ${error}`);
			if (
				error instanceof Error &&
				error.message.includes("cannot be voided")
			) {
				await MetadataService.delete({
					db,
					id: metadata.id,
				});
				return;
			}
		}
	} else if (
		stripeInvoice.status === "void" ||
		stripeInvoice.status === "uncollectible"
	) {
		await expirePendingRows();
		await MetadataService.delete({
			db,
			id: metadata.id,
		});
	}
};
