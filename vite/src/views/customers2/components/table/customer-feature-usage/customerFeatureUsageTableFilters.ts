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
		.sort(
			(a: FullCusEntWithFullCusProduct, b: FullCusEntWithFullCusProduct) => {
				// Sort by status first (Active items first)
				if (a.customer_product.status !== b.customer_product.status) {
					if (a.customer_product.status === CusProductStatus.Active) return -1;
					if (b.customer_product.status === CusProductStatus.Active) return 1;
					return 0;
				}

				// Then sort by created_at (newest first)
				return (
					new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
				);
			},
		);
}
