export type CatalogInvalidationParams = { orgId: string; env: string };

export type CatalogInvalidations = {
	/** Resolves once the broker has the record; subscribers drop the org's cached catalog rows as they read it. */
	invalidateOrgCatalog(
		params: CatalogInvalidationParams & { signal?: AbortSignal },
	): Promise<void>;
};
