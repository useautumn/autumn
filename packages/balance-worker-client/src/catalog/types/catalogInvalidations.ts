export type CatalogInvalidationParams = { orgId: string; env: string };

export type CatalogInvalidations = {
	invalidateOrgCatalog(
		params: CatalogInvalidationParams & { signal?: AbortSignal },
	): Promise<void>;
};
