import { CusProductStatus, type SubscriptionListStatus } from "@autumn/shared";

const DEFAULT_STATUSES: SubscriptionListStatus[] = ["active", "scheduled"];

const DB_STATUSES: Record<SubscriptionListStatus, CusProductStatus[]> = {
	active: [CusProductStatus.Active, CusProductStatus.PastDue],
	scheduled: [CusProductStatus.Scheduled, CusProductStatus.Pending],
	past_due: [CusProductStatus.PastDue],
	expired: [CusProductStatus.Expired],
};

export const subscriptionListStatusesToDb = ({
	statuses,
}: {
	statuses?: SubscriptionListStatus[];
}): CusProductStatus[] => [
	...new Set(
		(statuses ?? DEFAULT_STATUSES).flatMap((status) => DB_STATUSES[status]),
	),
];
