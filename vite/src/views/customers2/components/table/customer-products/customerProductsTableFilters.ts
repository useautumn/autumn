import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";

export function filterCustomerProducts({
	customer,
	showExpired,
}: {
	customer: FullCustomer;
	showExpired: boolean;
}): FullCusProduct[] {
	return customer.customer_products
		.filter((cp: FullCusProduct) => {
			if (showExpired) {
				return true;
			}

			return cp.status !== CusProductStatus.Expired;
		})
		.sort((a: FullCusProduct, b: FullCusProduct) => {
			if (a.status !== b.status) {
				// Simple status comparison - Active first, then others
				if (a.status === CusProductStatus.Active) return -1;
				if (b.status === CusProductStatus.Active) return 1;
				return 0;
			}

			return (
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
			);
		});
}
