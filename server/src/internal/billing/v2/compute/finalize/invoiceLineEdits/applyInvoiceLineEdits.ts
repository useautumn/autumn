import {
	type BillingContext,
	billingContextToCurrency,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customLineItemsToLineItems } from "@/internal/billing/v2/utils/lineItems/customLineItemsToLineItems";
import { toInvoicePeriod } from "@/internal/invoices/actions/create/setup/resolveInvoiceEnvelope";
import { lineItemToRemoveLine } from "./lineItemToRemoveLine";
import { removeInvoiceLines } from "./removeInvoiceLines";

/** Tags each line billed now with the remove_lines entry that targets it, then applies remove_lines and add_lines. */
export const applyInvoiceLineEdits = ({
	ctx,
	lineItems,
	billingContext,
}: {
	ctx: AutumnContext;
	lineItems: LineItem[];
	billingContext: BillingContext;
}): LineItem[] => {
	// Deferred lines bill on a later invoice, so they're never removal candidates.
	const immediateLineItems = lineItems.filter(
		(lineItem) => lineItem.chargeImmediately,
	);
	const taggedLineItems = lineItems.map((lineItem) =>
		lineItem.chargeImmediately
			? {
					...lineItem,
					removeLine: lineItemToRemoveLine({
						lineItem,
						lineItems: immediateLineItems,
					}),
				}
			: lineItem,
	);

	const { invoiceLineEdits } = billingContext;
	if (!invoiceLineEdits) return taggedLineItems;

	const keptLineItems = removeInvoiceLines({
		lineItems: taggedLineItems.filter((lineItem) => lineItem.chargeImmediately),
		removeLines: invoiceLineEdits.removeLines,
		requestEntityId: invoiceLineEdits.requestEntityId,
	});
	const deferredLineItems = taggedLineItems.filter(
		(lineItem) => !lineItem.chargeImmediately,
	);

	const addedLineItems = customLineItemsToLineItems({
		customLineItems: invoiceLineEdits.addLines,
		currency: billingContextToCurrency({ org: ctx.org, billingContext }),
	}).map((lineItem, index) => ({
		...lineItem,
		context: {
			...lineItem.context,
			effectivePeriod: toInvoicePeriod(invoiceLineEdits.addLines[index]),
		},
	}));

	return [...keptLineItems, ...deferredLineItems, ...addedLineItems];
};
