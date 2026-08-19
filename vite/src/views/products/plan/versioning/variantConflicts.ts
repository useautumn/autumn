import type { CatalogConflictPreview, PlanItemChangeV0 } from "@autumn/shared";
import type { PlanVariant } from "@/services/products/ProductService";

export interface VariantConflictInfo {
	variant: Pick<PlanVariant, "id" | "name">;
	conflicts: CatalogConflictPreview[];
	itemChanges: PlanItemChangeV0[];
}

const REASON_LABEL: Record<CatalogConflictPreview["reason"], string> = {
	different_interval: "Different interval",
	value_divergence: "Value override",
	base_price_divergence: "Price override",
};

const conflictFeature = (conflict: CatalogConflictPreview) =>
	conflict.feature_name ?? conflict.item_filter?.feature_id ?? "This feature";

const onLicense = (conflict: CatalogConflictPreview) =>
	conflict.license_plan_id ? ` on ${conflict.license_plan_id}` : "";

export const conflictSentence = (conflict: CatalogConflictPreview): string => {
	if (conflict.reason === "base_price_divergence") {
		if (!conflict.license_plan_id)
			return "Its base price would be overwritten.";
		return `Seat price on ${conflict.license_plan_id} would be overwritten.`;
	}
	if (conflict.reason === "different_interval") {
		return `${conflictFeature(conflict)}${onLicense(conflict)} is on a different interval here — propagating would add a duplicate item.`;
	}
	return `${conflictFeature(conflict)}${onLicense(conflict)} has a customized value that propagating would overwrite.`;
};

export const conflictBadgeLabel = (
	conflicts: CatalogConflictPreview[],
): string => {
	const reasons = new Set(conflicts.map((conflict) => conflict.reason));
	return reasons.size === 1 ? REASON_LABEL[[...reasons][0]] : "Conflicts";
};
