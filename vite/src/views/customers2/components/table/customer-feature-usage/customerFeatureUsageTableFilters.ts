import {
	CusProductStatus,
	type FullCusEntWithOptionalProduct,
} from "@autumn/shared";

export function filterCustomerFeatureUsage({
	entitlements,
	showExpired,
}: {
	entitlements: FullCusEntWithOptionalProduct[];
	showExpired: boolean;
}): FullCusEntWithOptionalProduct[] {
	return entitlements
		.filter((ent: FullCusEntWithOptionalProduct) => {
			if (showExpired) {
				return true;
			}
			// Extra entitlements (no customer_product) are always shown
			if (!ent.customer_product) {
				return true;
			}
			// Exclude expired and scheduled products from balance calculations
			return (
				ent.customer_product.status !== CusProductStatus.Expired &&
				ent.customer_product.status !== CusProductStatus.Scheduled
			);
		})
		.sort(
			(a: FullCusEntWithOptionalProduct, b: FullCusEntWithOptionalProduct) => {
				const aStatus = a.customer_product?.status;
				const bStatus = b.customer_product?.status;

				// Sort by status first (Active items first, null treated as active)
				if (aStatus !== bStatus) {
					if (!aStatus || aStatus === CusProductStatus.Active) return -1;
					if (!bStatus || bStatus === CusProductStatus.Active) return 1;
					return 0;
				}

				// Then sort by created_at (newest first)
				return (
					new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
				);
			},
		);
}
