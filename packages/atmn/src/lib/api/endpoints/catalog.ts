import type {
	CatalogUpdateParams,
	CatalogUpdateParamsInput,
} from "../../../../../../shared/api/catalog/previewUpdateCatalogParams.js";
import type { CatalogPreviewUpdateResponse } from "../../../../../../shared/api/catalog/previewUpdateCatalogResponse.js";
import type { CatalogUpdateResponse } from "../../../../../../shared/api/catalog/updateCatalogResponse.js";
import { request } from "../client.js";

export type {
	CatalogPreviewUpdateResponse,
	CatalogUpdateParams,
	CatalogUpdateParamsInput,
	CatalogUpdateResponse,
};

export async function previewUpdateCatalog(options: {
	secretKey: string;
	params: CatalogUpdateParamsInput;
}): Promise<CatalogPreviewUpdateResponse> {
	const { secretKey, params } = options;

	return await request<CatalogPreviewUpdateResponse>({
		method: "POST",
		path: "/v1/catalog.preview_update",
		secretKey,
		body: params,
		headers: { "X-API-Version": "2.2.0" },
	});
}

export async function updateCatalog(options: {
	secretKey: string;
	params: CatalogUpdateParamsInput;
}): Promise<CatalogUpdateResponse> {
	const { secretKey, params } = options;

	return await request<CatalogUpdateResponse>({
		method: "POST",
		path: "/v1/catalog.update",
		secretKey,
		body: params,
		headers: { "X-API-Version": "2.2.0" },
	});
}
