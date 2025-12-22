import {
	type CustomerPrice,
	type FullCustomer,
	generateId,
	type Price,
} from "@autumn/shared";

export const initCustomerPrice = ({
	price,
	fullCus,
	cusProductId,
}: {
	price: Price;
	fullCus: FullCustomer;
	cusProductId: string;
}): CustomerPrice => {
	return {
		id: generateId("cus_price"),
		internal_customer_id: fullCus.internal_id,
		customer_product_id: cusProductId,
		created_at: Date.now(),
		price_id: price.id,
	};
};
