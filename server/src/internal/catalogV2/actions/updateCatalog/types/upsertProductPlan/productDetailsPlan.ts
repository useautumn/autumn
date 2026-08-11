import type { Product, ProductDetailKey } from "@autumn/shared";

/** Products-column facet — absent when details are untouched. */
export type ProductDetailsPlan = {
	/** Product stamp after this facet (empty prices/ents on create). */
	product: Product;
	/** Changed detail columns holding their previous values; update only. */
	previousAttributes?: Partial<Pick<Product, ProductDetailKey>>;
};
