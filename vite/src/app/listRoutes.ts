import { lazyWithPreload } from "@/lib/lazyWithPreload";

export const ProductsListRoute = lazyWithPreload(
	() => import("@/views/products/ProductsView"),
);
export const CustomersListRoute = lazyWithPreload(
	() => import("@/views/customers/CustomersPage"),
);
