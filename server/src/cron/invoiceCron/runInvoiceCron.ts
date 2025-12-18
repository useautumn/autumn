import { type Metadata, MetadataType, metadata } from "@autumn/shared";

import { and, eq, lt } from "drizzle-orm";
import { createStripeCli } from "../../external/connect/createStripeCli";
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
	try {
		const { logger, db } = ctx;
		const data = metadata.data as AttachParams;
		const { org, customer } = data;
		const stripeCli = createStripeCli({ org, env: customer.env });

		if (!metadata.stripe_invoice_id) {
			return;
		}

		const invoice = await stripeCli.invoices.retrieve(
			metadata.stripe_invoice_id,
		);
		console.log(
			`Invoice: ${metadata.stripe_invoice_id} for customer ${customer.id} (org: ${org.slug})`,
		);
		if (invoice.status === "open") {
			try {
				await stripeCli.invoices.voidInvoice(metadata.stripe_invoice_id);
				logger.info(
					`voided invoice ${metadata.stripe_invoice_id} for customer ${customer.id} (org: ${org.slug})`,
				);

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
	} catch (error) {
		console.log("Error running invoice cron:", error);
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
				eq(metadata.type, MetadataType.InvoiceActionRequired),
				lt(metadata.expires_at, Date.now()),
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
