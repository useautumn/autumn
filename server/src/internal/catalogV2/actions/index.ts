import { getCatalogV2 } from "@/internal/catalogV2/actions/getCatalog/getCatalogV2";
import { updateCatalogV2 } from "@/internal/catalogV2/actions/updateCatalog/updateCatalogV2";

export const catalogV2Actions = {
	getCatalog: getCatalogV2,
	updateCatalog: updateCatalogV2,
} as const;
