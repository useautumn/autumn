import type { Catalog, MutationRecord } from "@autumn/balance-engine";
import {
	type CatalogCache,
	CatalogRowsNotFoundError,
	ensureCatalogForState,
} from "@autumn/catalog-lru";
import type { AutumnLogger } from "@autumn/logging";

/** The plan rows the record's subject references; null when a row is gone, which no retry can bring back. */
export const readRecordCatalog = async ({
	ctx,
	record,
}: {
	ctx: {
		catalogCache: Pick<CatalogCache, "read" | "load">;
		logger: Pick<AutumnLogger, "warn">;
	};
	record: MutationRecord;
}): Promise<Catalog | null> => {
	if (!record.after) return null;
	try {
		return await ensureCatalogForState({
			catalogCache: ctx.catalogCache,
			identity: record.identity,
			state: record.after.state,
		});
	} catch (cause) {
		if (!(cause instanceof CatalogRowsNotFoundError)) throw cause;
		ctx.logger.warn(
			{
				error: cause,
				type: "herald_webhook_catalog_missing",
				data: { recordId: record.id },
			},
			"A record references catalog rows Postgres no longer has; its webhooks are skipped",
		);
		return null;
	}
};
