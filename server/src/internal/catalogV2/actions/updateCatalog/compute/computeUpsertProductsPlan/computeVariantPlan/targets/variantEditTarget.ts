import type { CatalogVariantParams, FullProduct } from "@autumn/shared";

/** One existing variant row this base upsert touches, plus what to do to it. */
export type VariantEditTarget = {
	row: FullProduct;
	/** Apply the base row's current→next diff onto this row. */
	follow?: boolean;
	/** Listed in variants[] — stamp the pointer at the declaring base row. */
	declared?: boolean;
	/** Nested `base_variant_id: null` — clear the pointer. */
	unlink?: boolean;
	customize?: CatalogVariantParams["customize"];
	archived?: boolean;
	newVersionSlug?: string;
};
