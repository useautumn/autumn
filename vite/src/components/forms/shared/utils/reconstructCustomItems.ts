import type { FullCustomer, ProductItem, ProductV2 } from "@autumn/shared";
import { mapToProductItems } from "@autumn/shared";

/**
 * The plan's items as the customer actually holds them, falling back to the
 * plan definition for anything the customer has no saved row for.
 */
export function reconstructCustomItems({
	cusProduct,
	product,
}: {
	cusProduct: FullCustomer["customer_products"][number];
	product: ProductV2 | undefined;
}): ProductItem[] | null {
	const prices = cusProduct.customer_prices.map((cp) => cp.price);
	const entitlements = cusProduct.customer_entitlements.map(
		(ce) => ce.entitlement,
	);
	const features = cusProduct.customer_entitlements.map(
		(ce) => ce.entitlement.feature,
	);
	const customerItems = mapToProductItems({ prices, entitlements, features });
	const customerFeatureIds = new Set(
		customerItems.map((item) => item.feature_id).filter(Boolean),
	);
	const customerHasBasePrice =
		prices.length === 0 ||
		customerItems.some((item) => !item.feature_id && item.price != null);
	const missingProductItems =
		product?.items?.filter((item) => {
			if (!item.feature_id) return !customerHasBasePrice;
			return !customerFeatureIds.has(item.feature_id);
		}) ?? [];
	const items = [...customerItems, ...missingProductItems];
	return items.length > 0 ? items : null;
}
