import type { PlanUpdatePreviewItemChange } from "@autumn/shared";
import type { PlanVariant } from "@/services/products/ProductService";

export interface VariantConflictInfo {
	variant: PlanVariant;
	conflictFeatureNames: string[];
	itemChanges: PlanUpdatePreviewItemChange[];
}
