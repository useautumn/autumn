import type {
	PlanUpdatePreviewItemChange,
	PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";
import type { PlanVariant } from "@/services/products/ProductService";

export interface VariantConflictInfo {
	variant: Pick<PlanVariant, "id" | "name">;
	conflicts: PlanUpdatePreviewVariantConflict[];
	itemChanges: PlanUpdatePreviewItemChange[];
}

const REASON_LABEL: Record<PlanUpdatePreviewVariantConflict["reason"], string> =
	{
		different_interval: "Different interval",
		value_divergence: "Value override",
		base_price_divergence: "Price override",
	};

const conflictFeature = (conflict: PlanUpdatePreviewVariantConflict) =>
	conflict.feature_name ?? conflict.item_filter?.feature_id ?? "This feature";

export const conflictSentence = (
	conflict: PlanUpdatePreviewVariantConflict,
): string => {
	if (conflict.reason === "base_price_divergence") {
		return "Its base price would be overwritten.";
	}
	if (conflict.reason === "different_interval") {
		return `${conflictFeature(conflict)} is on a different interval here — propagating would add a duplicate item.`;
	}
	return `${conflictFeature(conflict)} has a customized value that propagating would overwrite.`;
};

export const conflictBadgeLabel = (
	conflicts: PlanUpdatePreviewVariantConflict[],
): string => {
	const reasons = new Set(conflicts.map((conflict) => conflict.reason));
	return reasons.size === 1 ? REASON_LABEL[[...reasons][0]] : "Conflicts";
};
