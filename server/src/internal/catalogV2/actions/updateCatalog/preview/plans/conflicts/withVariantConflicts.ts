import type { CatalogConflictPreview, FullProduct } from "@autumn/shared";
import { detectCatalogConflictsFromProducts } from "./detectCatalogConflictsFromProducts";
import { detectLicenseSlotConflicts } from "./detectLicenseSlotConflicts";

/** Plan-body clashes, then per-link license clashes (`license_plan_id` set). */
export const withVariantConflicts = <T extends object>({
	preview,
	current,
	next,
	relative,
}: {
	preview: T;
	current?: FullProduct | null;
	next?: FullProduct | null;
	relative?: FullProduct | null;
}): T & { conflicts?: CatalogConflictPreview[] } => {
	const conflicts = [
		...detectCatalogConflictsFromProducts({ current, next, relative }),
		...detectLicenseSlotConflicts({ current, next, relative }),
	];
	return conflicts.length > 0 ? { ...preview, conflicts } : preview;
};
