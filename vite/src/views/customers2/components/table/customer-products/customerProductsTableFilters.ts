import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import { filterByExpiredStatus } from "@/views/customers2/utils/tableFilterUtils";

export function filterCustomerProducts({
	customer,
	showExpired,
}: {
	customer: FullCustomer;
	showExpired: boolean;
}): FullCusProduct[] {
	return filterByExpiredStatus({
		items: customer.customer_products,
		showExpired,
	});
}

export function filterCustomerProductsByEntity({
	customer,
	showExpired,
}: {
	customer: FullCustomer;
	showExpired: boolean;
}): {
	regularProducts: FullCusProduct[];
	entityProducts: FullCusProduct[];
} {
	const allProducts = filterByExpiredStatus({
		items: customer.customer_products,
		showExpired,
	});

	const regularProducts = allProducts.filter(
		(product) => !product.internal_entity_id && !product.entity_id,
	);
	const entityProducts = allProducts.filter(
		(product) => product.internal_entity_id || product.entity_id,
	);

	return { regularProducts, entityProducts };
}
