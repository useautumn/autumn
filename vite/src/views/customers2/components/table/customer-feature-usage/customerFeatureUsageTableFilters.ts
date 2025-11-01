import {
	CusProductStatus,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";

export function filterCustomerFeatureUsage({
	entitlements,
	showExpired,
}: {
	entitlements: FullCusEntWithFullCusProduct[];
	showExpired: boolean;
}): FullCusEntWithFullCusProduct[] {
	return entitlements
		.filter((ent: FullCusEntWithFullCusProduct) => {
			if (showExpired) {
				return true;
			}

			return ent.customer_product.status !== CusProductStatus.Expired;
		})
		.sort((a: FullCusEntWithFullCusProduct, b: FullCusEntWithFullCusProduct) => {
			if (a.customer_product.status !== b.customer_product.status) {
				// Simple status comparison - Active first, then others
				if (a.customer_product.status === CusProductStatus.Active) return -1;
				if (b.customer_product.status === CusProductStatus.Active) return 1;
				return 0;
			}

			return (
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
			);
		});
}
