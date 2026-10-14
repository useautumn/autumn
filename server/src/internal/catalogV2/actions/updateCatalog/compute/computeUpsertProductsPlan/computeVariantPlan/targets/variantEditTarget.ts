import type { CatalogVariantParams, FullProduct } from "@autumn/shared";

export type VariantEditTarget = {
	row: FullProduct;
	follow?: boolean;
	declared?: boolean;
	unlink?: boolean;
	customize?: CatalogVariantParams["customize"];
	processors?: CatalogVariantParams["processors"];
	archived?: boolean;
	newVersionSlug?: string;
};
