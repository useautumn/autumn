import { withAppendDeadline } from "../append/withAppendDeadline.js";
import { BalanceWorkerClientError } from "../types/balanceWorkerClientErrors.js";
import type {
	CatalogInvalidationParams,
	CatalogInvalidations,
} from "./types/catalogInvalidations.js";

/** The typed door; a client built without a publisher refuses rather than silently dropping the signal. */
export function createCatalogInvalidations({
	ctx,
}: {
	ctx: { publisher?: CatalogInvalidations; timeoutMs: number };
}): CatalogInvalidations {
	async function invalidateOrgCatalog({
		signal,
		...params
	}: CatalogInvalidationParams & { signal?: AbortSignal }): Promise<void> {
		const publisher = ctx.publisher;
		if (!publisher) {
			throw new BalanceWorkerClientError({
				code: "CATALOG_INVALIDATIONS_UNAVAILABLE",
				outcome: "not_submitted",
				message: "This client has no catalog invalidation log to publish on",
			});
		}
		// Narrowed above; a function declaration does not carry the narrowing.
		const publishOn: CatalogInvalidations = publisher;
		function publish(): Promise<void> {
			return publishOn.invalidateOrgCatalog(params);
		}
		await withAppendDeadline({
			timeoutMs: ctx.timeoutMs,
			signal,
			run: publish,
		});
	}

	return { invalidateOrgCatalog };
}
