import {
	CusProductStatus,
	type FullCusEntWithFullCusProduct,
	isCusEntExpired,
	isPooledBalanceSourceCustomerEntitlement,
} from "@autumn/shared";
import type { CustomerProductsStatusOption } from "@/views/customers2/hooks/useCustomerProductsTableState";

export function filterCustomerFeatureUsage({
	entitlements,
	statuses,
}: {
	entitlements: FullCusEntWithFullCusProduct[];
	/** Mirrors the Plans table's status filter (nuqs customerProductsStatuses). */
	statuses: CustomerProductsStatusOption[];
}): FullCusEntWithFullCusProduct[] {
	const showActive = statuses.includes("active");
	const showExpired = statuses.includes("expired");

	return entitlements
		.filter((ent: FullCusEntWithFullCusProduct) => {
			if (
				isPooledBalanceSourceCustomerEntitlement({
					customerEntitlement: ent,
				})
			) {
				return false;
			}
			if (!ent.customer_product) {
				return isCusEntExpired({ cusEnt: ent }) ? showExpired : showActive;
			}
			if (ent.customer_product.status === CusProductStatus.Expired) {
				return showExpired;
			}
			// Scheduled products stay hidden from balance views.
			if (ent.customer_product.status === CusProductStatus.Scheduled) {
				return false;
			}
			return showActive;
		})
		.sort(
			(a: FullCusEntWithFullCusProduct, b: FullCusEntWithFullCusProduct) => {
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
