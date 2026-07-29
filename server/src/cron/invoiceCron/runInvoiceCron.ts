import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import { type Metadata, MetadataType, metadata } from "@autumn/shared";
import { addDays } from "date-fns";
import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import type { Stripe } from "stripe";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
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
			allowNotFound: true,
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

	let invoice: Stripe.Invoice | undefined;
	try {
		invoice = await stripeCli.invoices.retrieve(metadata.stripe_invoice_id);
	} catch {
		logger.warn(`Failed to retrieve invoice ${metadata.stripe_invoice_id}`);
		return;
	}

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
					`Invoice ${metadata.stripe_invoice_id} has a pending payment; retrying cleanup in 24 hours`,
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
	} else if (invoice.status === "void" || invoice.status === "uncollectible") {
		await MetadataService.delete({
			db,
			id: metadata.id,
		});
	}
};

export const getExpiredInvoiceMetadata = async ({
	db,
	now,
	limit,
	cursor,
}: {
	db: CronContext["db"];
	now: number;
	limit: number;
	cursor: { expiresAt: number; id: string } | null;
}) => {
	// Keyset over (expires_at, id) so each page is a bounded query: an
	// unbounded SELECT * over a large expired backlog pins xmin while it ships.
	return withStatementTimeout(db, async (tx) =>
		tx
			.select()
			.from(metadata)
			.where(
				and(
					or(
						eq(metadata.type, MetadataType.InvoiceActionRequired),
						eq(metadata.type, MetadataType.InvoiceCheckout),
						eq(metadata.type, MetadataType.DeferredInvoice),
					),
					isNotNull(metadata.expires_at),
					lt(metadata.expires_at, now),
					isNotNull(metadata.stripe_invoice_id),
					cursor
						? sql`(${metadata.expires_at}, ${metadata.id} COLLATE "C") > (${cursor.expiresAt}, ${cursor.id})`
						: undefined,
				),
			)
			.orderBy(asc(metadata.expires_at), sql`${metadata.id} COLLATE "C"`)
			.limit(limit),
	);
};

export const runInvoiceCron = async ({ ctx }: { ctx: CronContext }) => {
	try {
		console.log("Running invoice cron");
		const { db } = ctx;

		const now = Date.now();
		const pageSize = 500;
		const maxIterations = 20;
		const concurrency = 50;

		let cursor: { expiresAt: number; id: string } | null = null;
		let total = 0;

		for (let iteration = 0; iteration < maxIterations; iteration++) {
			const invoices = await getExpiredInvoiceMetadata({
				db,
				now,
				limit: pageSize,
				cursor,
			});
			if (invoices.length === 0) break;

			for (let i = 0; i < invoices.length; i += concurrency) {
				const batch = invoices.slice(i, i + concurrency);
				await Promise.all(
					batch.map((item) => handleVoidInvoiceCron({ ctx, metadata: item })),
				);
			}

			total += invoices.length;
			const last = invoices[invoices.length - 1];
			cursor = { expiresAt: Number(last.expires_at), id: last.id };

			if (invoices.length < pageSize) break;
		}

		if (total >= pageSize * maxIterations) {
			console.warn(
				`INVOICE CRON: hit maxIterations (${maxIterations}); backlog likely exceeds ${pageSize * maxIterations}, more runs needed — processed ${total}`,
			);
		}
		console.log(`FINISHED INVOICE CRON: processed ${total}`);
	} catch (error) {
		console.error("Error running invoice cron:", error);
		return;
	}
};
