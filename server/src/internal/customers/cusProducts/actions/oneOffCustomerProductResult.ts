import type {
	Customer,
	CustomerPrice,
	CustomerProduct,
	Organization,
	Price,
	Product,
} from "@autumn/shared";

export type OneOffCustomerProductResult = {
	customer_product: CustomerProduct;
	customer_price: CustomerPrice;
	price: Price;
	customer: Customer;
	product: Product;
	org: Organization;
};
