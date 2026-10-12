import type { Feature, PlanItemChangeV0 } from "@autumn/shared";
import { apiFeatureOverrideToDb, findFeatureById } from "@autumn/shared";
import {
	type RateChange,
	replacementRateChanges,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";

const itemOverride = (change: PlanItemChangeV0) =>
	change.item.feature_override
		? apiFeatureOverrideToDb(change.item.feature_override)
		: null;

/** A created item's rate rows, diffed against the deleted item of the same feature. */
export const itemChangeRateChanges = ({
	change,
	deleted,
	features,
}: {
	change: PlanItemChangeV0;
	deleted: PlanItemChangeV0[];
	features: Feature[];
}): RateChange[] => {
	const replaced = deleted.find(
		(candidate) => candidate.feature_id === change.feature_id,
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
