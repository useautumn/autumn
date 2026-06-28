import type {
	PlanUpdatePreviewItemChange,
	PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";
import type { PlanVariant } from "@/services/products/ProductService";

export interface VariantConflictInfo {
	variant: PlanVariant;
	conflicts: PlanUpdatePreviewVariantConflict[];
	itemChanges: PlanUpdatePreviewItemChange[];
}
