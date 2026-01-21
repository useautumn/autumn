import {
	cusProductToProduct,
	type FullCusProduct,
	type LineItem,
	lineItemToCustomerEntitlement,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { resetUsageBalances } from "@/internal/customers/attach/attachFunctions/upgradeDiffIntFlow/createUsageInvoiceItems";
import { logArrearInvoice } from "../logs/logArrearInvoices";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";
import { buildBillingContextFromWebhook } from "../utils/buildBillingContextFromWebhook";

/** Tracks line items and their source customer product for balance reset */
interface LineItemWithSource {
	lineItem: LineItem;
	customerProduct: FullCusProduct;
}

/**
 * Creates a single invoice for all usage-based (arrear) prices across all customer products
 * when a subscription is deleted.
 * Skips if the deletion was initiated by Autumn (e.g., during an upgrade flow).
 */
export const createInvoiceForArrearPrices = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionDeletedContext;
}): Promise<void> => {
	const { db } = ctx;
	const { stripeSubscription, fullCustomer, nowMs, paymentMethod } =
		eventContext;

	// 1. Build billing context
	const billingContext = buildBillingContextFromWebhook({
		stripeSubscription,
		fullCustomer,
		nowMs,
		paymentMethod,
	});

	// 2. Collect all line items across all customer products
	const lineItemsWithSource: LineItemWithSource[] = [];

	for (const customerProduct of eventContext.customerProducts) {
		const lineItems = customerProductToArrearLineItems({
			ctx,
			customerProduct,
			billingContext,
			filters: {
				onlyV4Usage: true,
			},
		});

		for (const lineItem of lineItems) {
			lineItemsWithSource.push({ lineItem, customerProduct });
		}
	}

	if (lineItemsWithSource.length === 0) return;

	// 3. Create, finalize, and pay a single invoice with all line items
	const allLineItems = lineItemsWithSource.map((item) => item.lineItem);
	const invoiceLines = lineItemsToInvoiceAddLinesParams({
		lineItems: allLineItems,
	});

	const { paid, invoice } = await createInvoiceForBilling({
		ctx,
		billingContext,
		stripeInvoiceAction: {
			addLineParams: { lines: invoiceLines },
		},
	});

	// 4. Log the invoice (even if payment failed)
	logArrearInvoice({
		ctx,
		invoiceId: invoice.id,
		paid,
		lineItems: allLineItems,
	});

	if (!paid) return;

	// 5. Reset usage balances for all affected customer entitlements (only if payment succeeded)
	const cusEntIdsByProduct = groupCusEntIdsByProduct({ lineItemsWithSource });
	for (const [customerProduct, cusEntIds] of cusEntIdsByProduct) {
		await resetUsageBalances({
			db,
			cusEntIds,
			cusProduct: customerProduct,
		});
	}

	// 6. Insert invoice into Autumn DB
	const fullProducts = eventContext.customerProducts.map((cp) =>
		cusProductToProduct({ cusProduct: cp }),
	);
	await upsertInvoiceFromBilling({
		ctx,
		stripeInvoice: invoice,
		fullProducts,
		fullCustomer,
	});
};

/**
 * Groups customer entitlement IDs by their source customer product.
 * Returns a Map for efficient iteration during balance reset.
 */
const groupCusEntIdsByProduct = ({
	lineItemsWithSource,
}: {
	lineItemsWithSource: LineItemWithSource[];
}): Map<FullCusProduct, string[]> => {
	const result = new Map<FullCusProduct, string[]>();

	for (const { lineItem, customerProduct } of lineItemsWithSource) {
		const cusEnt = lineItemToCustomerEntitlement({
			lineItem,
			customerProduct,
		});

		if (!cusEnt) continue;

		const existing = result.get(customerProduct) ?? [];
		existing.push(cusEnt.id);
		result.set(customerProduct, existing);
	}

	return result;
};
