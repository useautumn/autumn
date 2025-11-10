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
