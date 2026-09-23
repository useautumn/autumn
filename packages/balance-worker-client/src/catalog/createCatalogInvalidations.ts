import { BalanceWorkerClientError } from "../types/balanceWorkerClientErrors.js";
import type {
	CatalogInvalidationParams,
	CatalogInvalidations,
} from "./types/catalogInvalidations.js";

/** The typed door; a client built without a publisher refuses rather than silently dropping the signal. */
export function createCatalogInvalidations({
	ctx,
}: {
	ctx: { publisher?: CatalogInvalidations };
}): CatalogInvalidations {
	async function invalidateOrgCatalog(
		params: CatalogInvalidationParams,
	): Promise<void> {
		if (!ctx.publisher) {
			throw new BalanceWorkerClientError({
				code: "CATALOG_INVALIDATIONS_UNAVAILABLE",
				outcome: "not_submitted",
				message: "This client has no catalog invalidation log to publish on",
			});
		}
		await ctx.publisher.invalidateOrgCatalog(params);
	}

	return { invalidateOrgCatalog };
}
