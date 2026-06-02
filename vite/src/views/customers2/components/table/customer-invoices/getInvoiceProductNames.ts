import type {
	Feature,
	Invoice,
	InvoiceLineItem,
	ProductV2,
} from "@autumn/shared";

const UNKNOWN_PRODUCT_LABEL = "Custom Item";

type ProductGroup = {
	productName: string;
	featureNames: Set<string>;
};

/** Build the product-id based label used as a fallback while line items load. */
const getFallbackNames = ({
	invoice,
	products,
}: {
	invoice: Invoice;
	products: ProductV2[];
}): string =>
	invoice.product_ids
		.map((id) => products.find((p) => p.id === id)?.name)
		.filter(Boolean)
		.join(", ");

/** Resolve a line item's product display name, falling back to its id. */
const resolveProductName = ({
	productId,
	products,
	invoiceFallback,
}: {
	productId: string | null;
	products: ProductV2[];
	invoiceFallback?: string;
}): string => {
	if (!productId) return invoiceFallback ?? UNKNOWN_PRODUCT_LABEL;
	return products.find((p) => p.id === productId)?.name ?? productId;
};

/**
 * Build a Stripe-style "Product - Feature" label for an invoice from its line
 * items, so base-plan and usage invoices for the same product are
 * distinguishable (e.g. "Basic Monthly" vs "Basic Monthly - References").
 */
export const getInvoiceProductNames = ({
	invoice,
	lineItems,
	products,
	features,
}: {
	invoice: Invoice;
	lineItems: InvoiceLineItem[];
	products: ProductV2[];
	features: Feature[];
}): string => {
	if (lineItems.length === 0) return getFallbackNames({ invoice, products });
	const invoiceFallback =
		invoice.product_ids.length === 1
			? (products.find((p) => p.id === invoice.product_ids[0])?.name ??
				invoice.product_ids[0])
			: undefined;
	const groups = new Map<string, ProductGroup>();
	for (const item of lineItems) {
		const key = item.product_id ?? "__unknown__";
		const group =
			groups.get(key) ??
			({
				productName: resolveProductName({
					productId: item.product_id,
					products,
					invoiceFallback,
				}),
				featureNames: new Set<string>(),
			} satisfies ProductGroup);
		const chargedAmount = item.amount_after_discounts ?? item.amount;
		if (item.feature_id && chargedAmount > 0) {
			const featureName = features.find((f) => f.id === item.feature_id)?.name;
			if (featureName) group.featureNames.add(featureName);
		}
		groups.set(key, group);
	}
	const labels = Array.from(groups.values()).map(
		({ productName, featureNames }) => {
			if (featureNames.size === 0) return productName;
			return `${productName} - ${Array.from(featureNames).sort().join(", ")}`;
		},
	);
	const label = labels.join(", ");
	return label || getFallbackNames({ invoice, products });
};
