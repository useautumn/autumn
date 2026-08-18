import { updateCatalogV2 } from "@/internal/catalogV2/actions/updateCatalog/updateCatalogV2";

export const catalogV2Actions = {
	updateCatalog: updateCatalogV2,
} as const;
