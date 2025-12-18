import { type Metadata, MetadataType, metadata } from "@autumn/shared";

import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import { createStripeCli } from "../../external/connect/createStripeCli";
import { invoiceToSubId } from "../../external/stripe/stripeInvoiceUtils";
import type { AttachParams } from "../../internal/customers/cusProducts/AttachParams";
import { MetadataService } from "../../internal/metadata/MetadataService";
import type { CronContext } from "../utils/CronContext";

export const handleVoidInvoiceCron = async ({
	ctx,
	metadata,
}: {
	ctx: CronContext;
	metadata: Metadata;
}) => {
	const { logger, db } = ctx;
	const data = metadata.data as AttachParams;
	const { org, customer } = data;
	const stripeCli = createStripeCli({ org, env: customer.env });

	if (!metadata.stripe_invoice_id) return;

	const invoice = await stripeCli.invoices.retrieve(metadata.stripe_invoice_id);
	const subId = invoiceToSubId({ invoice });
	const voidSub = metadata.type === MetadataType.InvoiceCheckout;

	console.log(
		`Invoice: ${metadata.stripe_invoice_id} for customer ${customer.id} (org: ${org.slug})`,
	);

	if (invoice.status === "open") {
		try {
			await stripeCli.invoices.voidInvoice(metadata.stripe_invoice_id);
			logger.info(
				`voided invoice ${metadata.stripe_invoice_id} for customer ${customer.id} (org: ${org.slug})`,
			);

			if (voidSub && subId) {
				logger.info(`Voiding sub ${subId} [created through invoice checkout]`);
				await stripeCli.subscriptions.cancel(subId);

				logger.info(`Voided sub ${subId} [created through invoice checkout]`);
			}

			await MetadataService.delete({
				db,
				id: metadata.id,
			});
		} catch (error) {
			logger.error(`Error voiding invoice: ${error}`);
		}
	} else if (invoice.status === "void") {
		await MetadataService.delete({
			db,
			id: metadata.id,
		});
	}
};

export const runInvoiceCron = async ({ ctx }: { ctx: CronContext }) => {
	console.log("Running invoice cron");
	const { db } = ctx;

	// 1. Fetch from metadata invoices
	const invoices = await db
		.select()
		.from(metadata)
		.where(
			and(
				or(
					eq(metadata.type, MetadataType.InvoiceActionRequired),
					eq(metadata.type, MetadataType.InvoiceCheckout),
				),
				lt(metadata.expires_at, Date.now()),
				isNotNull(metadata.stripe_invoice_id),
			),
		);

	const batchSize = 50;
	for (let i = 0; i < invoices.length; i += batchSize) {
		const batch = invoices.slice(i, i + batchSize);

		const promises = [];
		for (const metadata of batch) {
			promises.push(handleVoidInvoiceCron({ ctx, metadata }));
		}
		await Promise.all(promises);
		console.log(`Handled ${i + batch.length}/${invoices.length} invoices`);
		console.log("----------------------------------\n");
	}
	console.log("FINISHED INVOICE CRON");
};
