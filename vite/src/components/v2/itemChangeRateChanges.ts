import type { Feature, PlanItemChangeV0 } from "@autumn/shared";
import { apiFeatureOverrideToDb, findFeatureById } from "@autumn/shared";
import {
	type RateChange,
	replacementRateChanges,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";

type ItemChange = Partial<PlanItemChangeV0>;

const itemOverride = (change: ItemChange) =>
	change.item?.feature_override
		? apiFeatureOverrideToDb(change.item.feature_override)
		: null;

/** A created item's rate rows, diffed against the deleted item of the same feature. */
export const itemChangeRateChanges = ({
	change,
	itemChanges,
	features,
}: {
	change: ItemChange;
	itemChanges: ItemChange[];
	features: Feature[];
}): RateChange[] => {
	if (change.action !== "created" || !change.feature_id) return [];
	const replaced = itemChanges.find(
		(candidate) =>
			candidate.action === "deleted" &&
			candidate.feature_id === change.feature_id,
	);
	return replacementRateChanges({
		replaced: replaced && { override: itemOverride(replaced) },
		next: itemOverride(change),
		creditSystem: findFeatureById({
			features,
			featureId: change.feature_id,
			errorOnNotFound: false,
		}),
		features,
	});
};
