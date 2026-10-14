import type { FullCustomer, ProductItem } from "@autumn/shared";
import { mapToProductItems } from "@autumn/shared";

export function reconstructCustomItems({
	cusProduct,
}: {
	cusProduct: FullCustomer["customer_products"][number];
}): ProductItem[] | null {
	const prices = cusProduct.customer_prices.map((cp) => cp.price);
	const entitlements = cusProduct.customer_entitlements.map(
		(ce) => ce.entitlement,
	);
	const features = cusProduct.customer_entitlements.map(
		(ce) => ce.entitlement.feature,
	);
	const items = mapToProductItems({ prices, entitlements, features });
	return items.length > 0 ? items : null;
}
