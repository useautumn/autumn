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
	const { discounts, isLoading, error } = useCusRewardsQuery({ enabled });

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

	const canVerifyRemovals = !isLoading && !error && !!customer && !!product;

	// Stale removals (e.g. after switching plans) are only dropped once discounts have loaded.
	const appliedRemovedRewardIds = useMemo(() => {
		if (!enabled) return [];
		if (!canVerifyRemovals) return removedRewardIds;
		return removedRewardIds.filter((rewardId) =>
			appliedDiscounts.some((discount) => discount.id === rewardId),
		);
	}, [enabled, canVerifyRemovals, removedRewardIds, appliedDiscounts]);

	return { appliedDiscounts, appliedRemovedRewardIds };
}
