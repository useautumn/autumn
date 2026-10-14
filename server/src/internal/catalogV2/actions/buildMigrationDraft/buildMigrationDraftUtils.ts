import {
	type ApiPlanItemV1,
	basePriceToKey,
	type DiffedCustomizePlanV1,
	featureOverrideToKey,
	type MigrationUpdatePlanCustomize,
	type PlanFilter,
	planItemMatchesFilter,
} from "@autumn/shared";
import type { MigrationTarget } from "./types";

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
		const previous = previousItemSets.map((items) =>
			items.find((item) => planItemMatchesFilter({ item, filter })),
		);
		const keys = new Set(
			previous.map((item) => featureOverrideToKey(item?.feature_override)),
		);
		const changed = customize.add_items?.some(
			(item) =>
				item.feature_id === filter.feature_id &&
				!keys.has(featureOverrideToKey(item.feature_override)),
		);
		if (!changed || keys.size !== 1 || previous.some((item) => !item))
			return filter;
		return {
			...filter,
			previous_feature_override: previous[0]?.feature_override ?? {},
		};
	});
	return { ...customize, remove_items };
};
