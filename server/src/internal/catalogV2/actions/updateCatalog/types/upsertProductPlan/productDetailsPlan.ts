import type { Product, ProductDetailKey } from "@autumn/shared";

/** Products-column facet — absent when details are untouched. */
export type ProductDetailsPlan = {
	/** True on create, or when an update changes detail columns. */
	changed: boolean;
	/** Product stamp after this facet (empty prices/ents on create). */
	product: Product;
	/** Changed detail columns holding their previous values; update only. */
	previousAttributes?: Partial<Pick<Product, ProductDetailKey>>;
};
