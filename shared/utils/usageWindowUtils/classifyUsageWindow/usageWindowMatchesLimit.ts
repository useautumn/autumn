import type { UsageWindowLimit } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { UsageWindow } from "../../../models/cusProductModels/cusEntModels/usageWindowTable.js";

/**
 * Whether a counter row and a resolved limit describe the same counter:
 * same feature (by internal id when both carry one), same scope (null
 * entity = customer scope), same filter identity (null/'' both mean the
 * unfiltered aggregate counter).
 */
export const usageWindowMatchesLimit = ({
	usageWindow,
	limit,
}: {
	usageWindow: UsageWindow;
	limit: UsageWindowLimit;
}): boolean =>
	(usageWindow.internal_feature_id && limit.internal_feature_id
		? usageWindow.internal_feature_id === limit.internal_feature_id
		: usageWindow.feature_id === limit.feature_id) &&
	(usageWindow.internal_entity_id ?? null) === limit.internal_entity_id &&
	(usageWindow.filter_key || "") === (limit.filter_key || "");
