import type { ApiDiscount, FullCustomer, ProductV2 } from "@autumn/shared";
import { useMemo } from "react";
import { useCusRewardsQuery } from "@/hooks/queries/useCusRewardsQuery";
import { getAttachAppliedDiscounts } from "../utils/getAttachAppliedDiscounts";

export function useAttachAppliedDiscounts({
	customer,
	entityId,
	product,
	newBillingSubscription,
	removedRewardIds,
	enabled,
}: {
	customer: FullCustomer | null;
	entityId: string | undefined;
	product: ProductV2 | undefined;
	newBillingSubscription: boolean;
	removedRewardIds: string[];
	enabled: boolean;
}): {
	appliedDiscounts: ApiDiscount[];
	appliedRemovedRewardIds: string[];
} {
	const { discounts } = useCusRewardsQuery({ enabled });

	const appliedDiscounts = useMemo(
		() =>
			enabled
				? getAttachAppliedDiscounts({
						customer,
						entityId,
						product,
						newBillingSubscription,
						discounts,
					})
				: [],
		[enabled, customer, entityId, product, newBillingSubscription, discounts],
	);

	// Removals for discounts no longer shown (e.g. after switching plans) are dropped.
	const appliedRemovedRewardIds = useMemo(
		() =>
			removedRewardIds.filter((rewardId) =>
				appliedDiscounts.some((discount) => discount.id === rewardId),
			),
		[removedRewardIds, appliedDiscounts],
	);

	return { appliedDiscounts, appliedRemovedRewardIds };
}
