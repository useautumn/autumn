import type { DbInvoiceLineItem } from "../../..";

/** Logs invoice line items in a compact tree format for debugging. */
export const logInvoiceLineItems = ({
	lineItems,
	stripeInvoiceId,
}: {
	lineItems: DbInvoiceLineItem[];
	stripeInvoiceId: string;
}) => {
	console.log(`\n📄 ${stripeInvoiceId} (${lineItems.length} items)`);

	const grouped = new Map<string, DbInvoiceLineItem[]>();
	for (const li of lineItems) {
		const key = li.product_id ?? "—";
		const bucket = grouped.get(key) ?? [];
		bucket.push(li);
		grouped.set(key, bucket);
	}

	for (const [productId, items] of grouped) {
		console.log(`  ├─ ${productId}`);
		for (let i = 0; i < items.length; i++) {
			const li = items[i];
			const branch = i === items.length - 1 ? "└─" : "├─";
			const dir = li.direction === "charge" ? "+" : "-";
			const feat = li.feature_id ?? "base";
			const prorated = li.prorated ? " ~" : "";
			const amt = `$${Math.abs(li.amount).toFixed(2)}`;
			console.log(`  │  ${branch} [${dir}] ${feat}${prorated}  ${amt}`);
		}
	}
};
