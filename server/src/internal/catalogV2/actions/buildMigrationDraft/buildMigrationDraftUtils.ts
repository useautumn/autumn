import {
	type ApiPlanItemV1,
	basePriceToKey,
	type DiffedCustomizePlanV1,
	featureOverrideToKey,
	itemsEqualIgnoringFeatureOverride,
	type MigrationUpdatePlanCustomize,
	type PlanFilter,
	planItemMatchesFilter,
} from "@autumn/shared";
import type { MigrationTarget } from "./types";

/** Whether any branch of the filter pins a specific version. */
export const isVersionPinned = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}): boolean => {
	if (planFilter.$or) {
		return planFilter.$or.some((branch) =>
			isVersionPinned({ planFilter: branch }),
		);
	}
	return planFilter.version !== undefined;
};

/** Sorted copy: planId alphabetical, then version ascending. */
export const sortTargetsByPlanVersion = ({
	targets,
}: {
	targets: MigrationTarget[];
}): MigrationTarget[] =>
	[...targets].sort(
		(left, right) =>
			left.planId.localeCompare(right.planId) || left.version - right.version,
	);

const previousPriceKey = ({
	previousPrice,
}: {
	previousPrice: MigrationTarget["previousPrice"];
}) =>
	previousPrice === null
		? "null"
		: basePriceToKey({ price: previousPrice });

/** Stamp previous_price only when every target shares one base price — one op can't carry mixed previous prices. */
export const stampPreviousPrice = ({
	customize,
	targets,
}: {
	customize: DiffedCustomizePlanV1;
	targets: MigrationTarget[];
}): MigrationUpdatePlanCustomize => {
	if (customize.price === undefined) return customize;

	const uniquePreviousPrices = new Set(
		targets.map((target) =>
			previousPriceKey({ previousPrice: target.previousPrice }),
		),
	);
	if (uniquePreviousPrices.size !== 1) return customize;

	return {
		...customize,
		previous_price: targets[0]!.previousPrice,
	};
};

/** Display-only stamps on each remove filter, set only when every target's replaced item agrees and the override changes:
 * the old override (empty when inherited) and whether nothing else changed. */
export const stampPreviousFeatureOverrides = ({
	customize,
	previousItemSets,
}: {
	customize: MigrationUpdatePlanCustomize;
	previousItemSets: ApiPlanItemV1[][];
}): MigrationUpdatePlanCustomize => {
	if (!customize.remove_items || previousItemSets.length === 0)
		return customize;
	const remove_items = customize.remove_items.map((filter) => {
		const adds = (customize.add_items ?? []).filter(
			(item) => item.feature_id === filter.feature_id,
		);
		const next =
			adds.length === 1
				? adds[0]
				: adds.find(
						(item) =>
							String(item.price?.interval ?? item.reset?.interval) ===
								String(filter.interval) &&
							(item.price?.interval_count ??
								item.reset?.interval_count ??
								1) === (filter.interval_count ?? 1),
					);
		const previous = previousItemSets.map((items) =>
			items.find((item) => planItemMatchesFilter({ item, filter })),
		);
		const keys = new Set(
			previous.map((item) => featureOverrideToKey(item?.feature_override)),
		);
		if (
			!next ||
			previous.some((item) => !item) ||
			keys.size !== 1 ||
			keys.has(featureOverrideToKey(next.feature_override))
		)
			return filter;
		const onlyOverrideChanged = previous.every(
			(item) => item && itemsEqualIgnoringFeatureOverride(item, next),
		);
		return {
			...filter,
			previous_feature_override: previous[0]?.feature_override ?? {},
			...(onlyOverrideChanged && { only_feature_override_changed: true }),
		};
	});
	return { ...customize, remove_items };
};
