import { lazyWithPreload } from "@/lib/lazyWithPreload";

export const CustomerViewRoute = lazyWithPreload(
	() => import("./CustomerView2"),
);
export const loadCustomerView = CustomerViewRoute.preload;
