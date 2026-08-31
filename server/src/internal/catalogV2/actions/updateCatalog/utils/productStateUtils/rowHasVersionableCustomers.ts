import { type FullProduct, productToProductKey } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { productKeyToState } from "./productKeyToState";

/** True when this row has customer products a version edit must not rewrite. */
export const rowHasVersionableCustomers = ({
	row,
	productStatesContext,
}: {
	row: FullProduct;
	productStatesContext: ProductStatesContext;
}): boolean =>
	productKeyToState({
		productKey: productToProductKey({ product: row }),
		productStatesContext,
	}).customerUsage.hasVersionableCustomerProducts;
