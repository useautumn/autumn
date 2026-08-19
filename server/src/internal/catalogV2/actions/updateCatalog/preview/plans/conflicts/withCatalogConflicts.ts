import type {
	CatalogConflictPreview,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import { detectCatalogConflictsFromProducts } from "./detectCatalogConflictsFromProducts";

/** Spread onto a preview row; omitted when nothing diverged. */
export const withCatalogConflicts = <T extends object>({
	preview,
	current,
	next,
	relative,
}: {
	preview: T;
	current?: FullProductWithoutLicenses | null;
	next?: FullProductWithoutLicenses | null;
	relative?: FullProductWithoutLicenses | null;
}): T & { conflicts?: CatalogConflictPreview[] } => {
	const conflicts = detectCatalogConflictsFromProducts({
		current,
		next,
		relative,
	});
	return conflicts.length > 0 ? { ...preview, conflicts } : preview;
};
