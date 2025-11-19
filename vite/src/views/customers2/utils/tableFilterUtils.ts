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
			// Sort by status priority: Active > Trialing > Scheduled > PastDue > Expired
			if (a.status !== b.status) {
				const statusPriority = {
					[CusProductStatus.Active]: 1,
					[CusProductStatus.Trialing]: 2,
					[CusProductStatus.Scheduled]: 3,
					[CusProductStatus.PastDue]: 4,
					[CusProductStatus.Expired]: 5,
					[CusProductStatus.Unknown]: 6,
				};
				return (
					(statusPriority[a.status] || 99) - (statusPriority[b.status] || 99)
				);
			}

			// Then sort by created_at (newest first)
			return (
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
			);
		});
}
