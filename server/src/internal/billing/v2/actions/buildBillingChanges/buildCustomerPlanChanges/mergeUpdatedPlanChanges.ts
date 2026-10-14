import type { CustomerPlanChange } from "@autumn/shared";

const updatedChangeMergeKey = (
	change: CustomerPlanChange,
): string | undefined => {
	if (change.subscription) {
		const subscription = change.subscription;
		return [
			"subscription",
			change.entity_id ?? "",
			subscription.plan_id,
			subscription.status,
			subscription.started_at,
			subscription.expires_at,
			subscription.canceled_at,
			subscription.trial_ends_at,
		].join(":");
	}

	if (change.purchase) {
		const purchase = change.purchase;
		return [
			"purchase",
			change.entity_id ?? "",
			purchase.plan_id,
			purchase.status,
			purchase.expires_at,
		].join(":");
	}
};

export const mergeUpdatedPlanChanges = (
	changes: CustomerPlanChange[],
): CustomerPlanChange[] => {
	const mergedByKey = new Map<string, CustomerPlanChange>();
	const result: CustomerPlanChange[] = [];

	for (const change of changes) {
		const mergeKey = updatedChangeMergeKey(change);
		if (change.action !== "updated" || mergeKey === undefined) {
			result.push(change);
			continue;
		}

		const existing = mergedByKey.get(mergeKey);
		if (existing === undefined) {
			mergedByKey.set(mergeKey, change);
			result.push(change);
			continue;
		}

		existing.subscription = existing.subscription ?? change.subscription;
		existing.purchase = existing.purchase ?? change.purchase;
		const mergedPreviousAttributes = {
			...(existing.previous_attributes ?? {}),
			...(change.previous_attributes ?? {}),
		};
		existing.previous_attributes =
			Object.keys(mergedPreviousAttributes).length > 0
				? mergedPreviousAttributes
				: null;
		existing.item_changes = [
			...(existing.item_changes ?? []),
			...(change.item_changes ?? []),
		];
		existing.plan_change = existing.plan_change ?? change.plan_change;
	}

	return result;
};
