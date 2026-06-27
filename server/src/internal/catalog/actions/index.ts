import { previewUpdateCatalog } from "./previewUpdateCatalog/previewUpdateCatalog.js";

/** Higher-order catalog (features + plans batch) operations. */
export const catalogActions = {
	previewUpdate: previewUpdateCatalog,
} as const;
