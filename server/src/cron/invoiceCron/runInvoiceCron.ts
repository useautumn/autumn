import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import { type Metadata, MetadataType, metadata } from "@autumn/shared";
import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import { OrgService } from "@/internal/orgs/OrgService";
import { createStripeCli } from "../../external/connect/createStripeCli";
import { stripeInvoiceToStripeSubscriptionId } from "../../external/stripe/invoices/utils/convertStripeInvoice";
import type { AttachParams } from "../../internal/customers/cusProducts/AttachParams";
import { MetadataService } from "../../internal/metadata/MetadataService";
import type { CronContext } from "../utils/CronContext";

const getOrgAndCustomerFromMetadata = async ({
	ctx,
	metadata,
}: {
	ctx: CronContext;
	metadata: Metadata;
}) => {
	const { db } = ctx;
	const data = metadata.data as AttachParams | DeferredAutumnBillingPlanData;
	if ("org" in data) {
		return { org: data.org, customer: data.customer };
	} else if ("orgId" in data) {
		const { orgId, env } = data;
		const orgWithFeatures = await OrgService.getWithFeatures({
			db,
			orgId,
			env,
		});

		return {
			org: orgWithFeatures?.org,
			customer: data.billingContext?.fullCustomer,
		};
	}

	return { org: undefined, customer: undefined };
};

export const handleVoidInvoiceCron = async ({
	ctx,
	metadata,
}: {
	ctx: CronContext;
	metadata: Metadata;
}) => {
	const { logger, db } = ctx;

	const { org, customer } = await getOrgAndCustomerFromMetadata({
		ctx,
		metadata,
	});
	if (!org || !customer) return;

	const stripeCli = createStripeCli({ org, env: customer.env });

	if (!metadata.stripe_invoice_id) return;

	const invoice = await stripeCli.invoices.retrieve(metadata.stripe_invoice_id);
	const subId = stripeInvoiceToStripeSubscriptionId(invoice);
	const voidSub = metadata.type === MetadataType.InvoiceCheckout;

	console.log(
		`Invoice: ${metadata.stripe_invoice_id} for customer ${customer.id} (org: ${org.slug}) - status: ${invoice.status}`,
	);

	if (invoice.status === "open") {
		try {
			await stripeCli.invoices.voidInvoice(metadata.stripe_invoice_id);
			logger.info(
				`voided invoice ${metadata.stripe_invoice_id} for customer ${customer.id} (org: ${org.slug})`,
			);

			if (voidSub && subId) {
				logger.info(`Voiding sub ${subId} [created through invoice checkout]`);
				try {
					await stripeCli.subscriptions.cancel(subId);
				} catch (error) {
					logger.warn(`Error voiding sub ${subId}: ${error}`);
				}
			}

			await MetadataService.delete({
				db,
				id: metadata.id,
			});
		} catch (error) {
			logger.error(`Error voiding invoice: ${error}`);
		}
	} else if (invoice.status === "void" || invoice.status === "uncollectible") {
		await MetadataService.delete({
			db,
			id: metadata.id,
		});
	}
};

export const runInvoiceCron = async ({ ctx }: { ctx: CronContext }) => {
	try {
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
						eq(metadata.type, MetadataType.DeferredInvoice),
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
	} catch (error) {
		console.error("Error running invoice cron:", error);
		return;
	}
};
