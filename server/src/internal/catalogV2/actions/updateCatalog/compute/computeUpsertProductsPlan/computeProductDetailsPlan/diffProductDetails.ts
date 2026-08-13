import {
	PRODUCT_DETAIL_KEYS,
	type Product,
	productDetailFieldIsSame,
} from "@autumn/shared";
import type { ProductDetailsPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Changed detail columns → their previous values. */
export const diffProductDetails = ({
	current,
	next,
}: {
	current: Product;
	next: Product;
}): NonNullable<ProductDetailsPlan["previousAttributes"]> => {
	const previousAttributes: NonNullable<
		ProductDetailsPlan["previousAttributes"]
	> = {};

	for (const key of PRODUCT_DETAIL_KEYS) {
		if (!productDetailFieldIsSame({ key, product1: current, product2: next })) {
			Object.assign(previousAttributes, { [key]: current[key] });
		}
	}

	return previousAttributes;
};
