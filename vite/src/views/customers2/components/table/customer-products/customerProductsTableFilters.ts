import {
	cusProductToProduct,
	type FullCusProduct,
	type FullCustomer,
	isOneOffProductV2,
	mapToProductV2,
} from "@autumn/shared";
import { filterByExpiredStatus } from "@/views/customers2/utils/tableFilterUtils";

/**
 * Determines if a customer product is a one-off purchase using existing utilities
 */
function isOneOffCusProduct(cusProduct: FullCusProduct): boolean {
	const fullProduct = cusProductToProduct({ cusProduct });
	const productV2 = mapToProductV2({ product: fullProduct });
	return isOneOffProductV2({ items: productV2.items });
}

function filterCustomerProducts({
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

function filterCustomerProductsByEntity({
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

/**
 * Filters and splits customer products by subscription type AND entity level
 */
export function filterCustomerProductsByType({
	customer,
	showExpired,
}: {
	customer: FullCustomer;
	showExpired: boolean;
}): {
	subscriptions: {
		customerLevel: FullCusProduct[];
		entityLevel: FullCusProduct[];
	};
	purchases: {
		customerLevel: FullCusProduct[];
		entityLevel: FullCusProduct[];
	};
} {
	const { regularProducts, entityProducts } = filterCustomerProductsByEntity({
		customer,
		showExpired,
	});

	return {
		subscriptions: {
			customerLevel: regularProducts.filter((p) => !isOneOffCusProduct(p)),
			entityLevel: entityProducts.filter((p) => !isOneOffCusProduct(p)),
		},
		purchases: {
			customerLevel: regularProducts.filter((p) => isOneOffCusProduct(p)),
			entityLevel: entityProducts.filter((p) => isOneOffCusProduct(p)),
		},
	};
}
