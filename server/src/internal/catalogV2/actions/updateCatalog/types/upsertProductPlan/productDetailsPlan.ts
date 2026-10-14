import type { Product, ProductDetailKey } from "@autumn/shared";

export type ProductDetailsPlan = {
	changed: boolean;
	product: Product;
	previousAttributes?: Partial<Pick<Product, ProductDetailKey>>;
};
