import type { DbInvoiceLineItem } from "../../..";

/** Logs invoice line items in a readable table format for debugging. */
export const logInvoiceLineItems = ({
	lineItems,
	stripeInvoiceId,
}: {
	lineItems: DbInvoiceLineItem[];
	stripeInvoiceId: string;
}) => {
	console.log(
		`\n📄 Invoice line items for ${stripeInvoiceId} (${lineItems.length} items):`,
	);
	for (const li of lineItems) {
		console.log(
			`  [${li.direction}] ${li.description} | amount: ${li.amount} | after_discounts: ${li.amount_after_discounts} | product: ${li.product_id ?? "—"} | feature: ${li.feature_id ?? "—"} | prorated: ${li.prorated}`,
		);
	}
};
