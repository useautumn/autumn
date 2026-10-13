import {
	type BillingContext,
	billingContextToCurrency,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customLineItemsToLineItems } from "@/internal/billing/v2/utils/lineItems/customLineItemsToLineItems";
import { toInvoicePeriod } from "@/internal/invoices/actions/create/setup/resolveInvoiceEnvelope";
import { removeInvoiceLines } from "./removeInvoiceLines";

/** remove_lines then add_lines on the lines Autumn generated for this invoice. */
export const applyInvoiceLineEdits = ({
	ctx,
	lineItems,
	billingContext,
}: {
	ctx: AutumnContext;
	lineItems: LineItem[];
	billingContext: BillingContext;
}): LineItem[] => {
	const { invoiceLineEdits } = billingContext;
	if (!invoiceLineEdits) return lineItems;

	const keptLineItems = removeInvoiceLines({
		lineItems,
		removeLines: invoiceLineEdits.removeLines,
		requestEntityId: invoiceLineEdits.requestEntityId,
	});

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

	return [...keptLineItems, ...addedLineItems];
};
