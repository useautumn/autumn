import { CusProductStatus } from "@autumn/shared";

/**
 * Generic utility for filtering and sorting items by expired status.
 * Used by customer products and feature usage tables.
 */
export function filterByExpiredStatus<
	T extends { status: CusProductStatus; created_at: string | number },
>({ items, showExpired }: { items: T[]; showExpired: boolean }): T[] {
	return items
		.filter((item) => {
			if (showExpired) {
				return true;
			}
			return item.status !== CusProductStatus.Expired;
		})
		.sort((a, b) => {
			// Sort by status first (Active items first)
			if (a.status !== b.status) {
				if (a.status === CusProductStatus.Active) return -1;
				if (b.status === CusProductStatus.Active) return 1;
				return 0;
			}

			// Then sort by created_at (newest first)
			return (
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
			);
		});
}
