import type { FullCustomer, ProductV2 } from "@autumn/shared";
import { reconstructCustomItems } from "@/components/forms/shared/utils/reconstructCustomItems";
import { backendToDisplayQuantity } from "@/utils/billing/prepaidQuantityUtils";
import {
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "./customerStateSchema";

/** A saved plan as a customer-state row, keeping its customizations. */
export function customerProductToCustomerStatePlan({
	cusProduct,
	products,
}: {
	cusProduct: FullCustomer["customer_products"][number];
	products: ProductV2[];
}): CustomerStatePlan {
	const product = products.find((p) => p.id === cusProduct.product_id);

	const isCustom =
		cusProduct.is_custom ||
		cusProduct.customer_prices.some((cp) => cp.price.is_custom) ||
		cusProduct.customer_entitlements.some((ce) => ce.entitlement.is_custom);
	const items = isCustom
		? reconstructCustomItems({ cusProduct, product })
		: null;

	// A custom plan can sell a different pack size than the catalog.
	const prepaidItems = (items ?? product?.items ?? []).filter(
		(item) => item.feature_id && item.usage_model === "prepaid",
	);
	const prepaidOptions =
		prepaidItems.length > 0 && cusProduct.options?.length > 0
			? backendToDisplayQuantity({
					backendOptions: cusProduct.options,
					prepaidItems,
				})
			: {};

	return {
		...EMPTY_CUSTOMER_STATE_PLAN,
		productId: cusProduct.product_id,
		version: cusProduct.product.version,
		prepaidOptions,
		items,
		isCustom,
		// Plans span entities, so each row carries its own scope.
		entityId: cusProduct.entity_id ?? null,
	};
}
