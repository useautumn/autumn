import {
	type LineItem,
	LineItemSchema,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { stripeLineItemsToDbLineItems } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/index.js";
import { fetchSubscriptionItemsInfo } from "@/internal/billing/v2/workflows/storeInvoiceLineItems/fetchSubscriptionItemsMetadata.js";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";

export const storeLineItems = async ({
	ctx,
	stripeInvoiceId,
	autumnInvoiceId,
	billingLineItems,
	reconcileOnly,
}: {
	ctx: AutumnContext;
	stripeInvoiceId: string;
	autumnInvoiceId: string;
	billingLineItems?: unknown[];
	reconcileOnly?: boolean;
}): Promise<void> => {
	const { db, org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const stripeLineItems = await getStripeInvoiceLineItems({
		stripeClient: stripeCli,
		invoiceId: stripeInvoiceId,
	});

	const stripeDiscounts = stripeLineItems.some(
		(lineItem) => (lineItem.discount_amounts?.length ?? 0) > 0,
	)
		? (
				await getStripeInvoice({
					stripeClient: stripeCli,
					invoiceId: stripeInvoiceId,
					expand: ["discounts.source.coupon"],
				})
			).discounts
		: [];

	if (stripeLineItems.length === 0) {
		ctx.logger.debug(
			`[storeInvoiceLineItems] No line items found for ${stripeInvoiceId}`,
		);
		await invoiceLineItemRepo.deleteStaleByStripeInvoiceId({
			db,
			stripeInvoiceId,
			activeStripeIds: [],
		});
		return;
	}

	const subscriptionItemInfo = await fetchSubscriptionItemsInfo({
		stripeCli,
		stripeLineItems,
	});

	// Stripe creates these for usage-based prices with zero usage, and for
	const filteredStripeLineItems = stripeLineItems.filter((li) => {
		if (li.amount !== 0) return true;
		if ((li.quantity ?? 0) !== 0) return true;

		const subItemId = li.parent?.subscription_item_details?.subscription_item;
		if (typeof subItemId !== "string") return true;

		const info = subscriptionItemInfo.get(subItemId);
		if (info?.isMetered) return false;

		if (li.pricing?.unit_amount_decimal === "0") return false;

		return true;
	});

	const remainingStripeLineItems = await updateDeferredLineItems({
		ctx,
		stripeLineItems: filteredStripeLineItems,
		autumnInvoiceId,
		stripeInvoiceId,
	});

	let autumnLineItems: LineItem[] | undefined;
	if (billingLineItems && billingLineItems.length > 0) {
		autumnLineItems = billingLineItems
			.map((item) => {
				const result = LineItemSchema.safeParse(item);
				if (!result.success) {
					ctx.logger.warn(
						`[storeInvoiceLineItems] Dropping unparseable billing line item for ${stripeInvoiceId}: ${result.error.issues
							.slice(0, 3)
							.map((i) => `${i.path.join(".")}: ${i.message}`)
							.join("; ")}`,
					);
					return null;
				}
				return result.data;
			})
			.filter((item): item is LineItem => item !== null);
	}

	const subscriptionItemMetadata = new Map(
		Array.from(subscriptionItemInfo.entries()).map(([id, info]) => [
			id,
			info.metadata,
		]),
	);

	const dbLineItems = stripeLineItemsToDbLineItems({
		stripeLineItems: remainingStripeLineItems,
		stripeDiscounts,
		invoiceId: autumnInvoiceId,
		stripeInvoiceId,
		autumnLineItems,
		subscriptionItemMetadata,
	});

	if (dbLineItems.length > 0) {
		if (reconcileOnly) {
			await invoiceLineItemRepo.reconcileMany({
				db,
				lineItems: dbLineItems,
			});
		} else {
			await invoiceLineItemRepo.upsertMany({
				db,
				lineItems: dbLineItems,
			});
		}

		ctx.logger.info(
			`${reconcileOnly ? "Reconciled" : "Stored"} invoice line items`,
			{
				data2: dbLineItems.map((li) => ({
					id: li.id,
					stripe_id: li.stripe_id,
					feature_id: li.feature_id,
					amount: li.amount,
					direction: li.direction,
					total_quantity: li.total_quantity,
					paid_quantity: li.paid_quantity,
				})),
			},
		);
	}

	const activeStripeIds = filteredStripeLineItems
		.map((li) => li.id)
		.filter((id): id is string => id != null);

	await invoiceLineItemRepo.deleteStaleByStripeInvoiceId({
		db,
		stripeInvoiceId,
		activeStripeIds,
	});
};

const updateDeferredLineItems = async ({
	ctx,
	stripeLineItems,
	autumnInvoiceId,
	stripeInvoiceId,
}: {
	ctx: AutumnContext;
	stripeLineItems: ExpandedStripeInvoiceLineItem[];
	autumnInvoiceId: string;
	stripeInvoiceId: string;
}): Promise<ExpandedStripeInvoiceLineItem[]> => {
	const invoiceItemMap = new Map<string, ExpandedStripeInvoiceLineItem>();
	for (const li of stripeLineItems) {
		const invoiceItemId = li.parent?.invoice_item_details?.invoice_item;
		if (typeof invoiceItemId === "string") {
			invoiceItemMap.set(invoiceItemId, li);
		}
	}

	if (invoiceItemMap.size === 0) {
		return stripeLineItems;
	}

	let deferredRows: Awaited<
		ReturnType<typeof invoiceLineItemRepo.getDeferredByInvoiceItemIds>
	>;
	try {
		deferredRows = await invoiceLineItemRepo.getDeferredByInvoiceItemIds({
			db: ctx.db,
			stripeInvoiceItemIds: Array.from(invoiceItemMap.keys()),
		});
	} catch (error) {
		ctx.logger.error(
			`[storeInvoiceLineItems] Failed loading deferred rows for ${stripeInvoiceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		return stripeLineItems;
	}

	if (deferredRows.length === 0) {
		return stripeLineItems;
	}

	const matchedInvoiceItemIds = new Set<string>();
	for (const row of deferredRows) {
		try {
			if (!row.stripe_invoice_item_id) continue;

			const stripeLineItem = invoiceItemMap.get(row.stripe_invoice_item_id);
			if (!stripeLineItem) continue;

			const amount = stripeToAtmnAmount({
				amount: stripeLineItem.amount,
				currency: stripeLineItem.currency,
			});
			const discountTotal = (stripeLineItem.discount_amounts ?? []).reduce(
				(sum, d) => sum + d.amount,
				0,
			);
			const amountAfterDiscounts = stripeToAtmnAmount({
				amount: stripeLineItem.amount - discountTotal,
				currency: stripeLineItem.currency,
			});

			await invoiceLineItemRepo.updateDeferredLineItem({
				db: ctx.db,
				id: row.id,
				updates: {
					invoice_id: autumnInvoiceId,
					stripe_invoice_id: stripeInvoiceId,
					stripe_id: stripeLineItem.id,
					amount,
					amount_after_discounts: amountAfterDiscounts,
					stripe_quantity: stripeLineItem.quantity ?? null,
				},
			});

			matchedInvoiceItemIds.add(row.stripe_invoice_item_id);
		} catch (error) {
			ctx.logger.error(
				`[storeInvoiceLineItems] Failed to update deferred line item ${row.id} for stripe invoice ${stripeInvoiceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	if (matchedInvoiceItemIds.size > 0) {
		ctx.logger.info(
			`[storeInvoiceLineItems] Updated ${matchedInvoiceItemIds.size} deferred line items with invoice ${stripeInvoiceId}`,
		);
	}

	return stripeLineItems.filter((li) => {
		const invoiceItemId = li.parent?.invoice_item_details?.invoice_item;
		if (typeof invoiceItemId !== "string") return true;
		return !matchedInvoiceItemIds.has(invoiceItemId);
	});
};
