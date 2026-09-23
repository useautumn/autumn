import { type Metadata, MetadataType, metadata } from "@autumn/shared";
import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import { expirePendingPlanAtDueDate } from "@/internal/billing/v2/actions/expirePendingPlan/expirePendingPlanAtDueDate";
import type { CronContext } from "../utils/CronContext";
import { setupInvoiceCronContext } from "./setupInvoiceCronContext";
import { voidExpiredLegacyInvoice } from "./voidExpiredLegacyInvoice";

export const handleVoidInvoiceCron = async ({
	ctx,
	metadata,
}: {
	ctx: CronContext;
	metadata: Metadata;
}) => {
	// 1. Setup
	const invoiceCronContext = await setupInvoiceCronContext({ ctx, metadata });
	if (!invoiceCronContext) return;

	// 2. Legacy invoice metadata keeps its original cleanup
	if (metadata.type !== MetadataType.DeferredInvoice) {
		await voidExpiredLegacyInvoice({ ctx, invoiceCronContext, metadata });
		return;
	}

	// 3. Deferred invoice reached its due date
	const { stripeCli, stripeInvoice, repoContext } = invoiceCronContext;
	try {
		await expirePendingPlanAtDueDate({
			ctx: repoContext,
			stripeCli,
			metadata,
			stripeInvoice,
		});
	} catch (error) {
		ctx.logger.error(
			`Error expiring pending plan for invoice ${stripeInvoice.id}; retrying next run: ${error}`,
		);
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
