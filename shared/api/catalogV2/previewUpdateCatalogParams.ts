import { UpdateCatalogParamsSchema } from "./updateCatalogParams.js";

/** Preview takes the EXACT params you will pass to update — same schema by construction. */
export const PreviewUpdateCatalogParamsSchema = UpdateCatalogParamsSchema;

export type {
	UpdateCatalogParams as PreviewUpdateCatalogParams,
	UpdateCatalogParamsInput as PreviewUpdateCatalogParamsInput,
} from "./updateCatalogParams.js";
