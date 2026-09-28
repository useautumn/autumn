import { meteringIdentityToSubjectKey } from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { AutumnLogger } from "@autumn/logging";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";

/** The subjects a batch moved, once each: what the job will read from the worker and push. */
const batchToSubjectKeys = ({
	records,
}: {
	records: StreamRecord[];
}): string[] => [
	...new Set(
		records.map(({ record }) =>
			meteringIdentityToSubjectKey({ identity: record.identity }),
		),
	),
];

/**
 * Skeleton of the job that pushes a subject's balances to the customer's cache.
 * Next: read each subject's state from its worker, join it with the catalog, publish. Pushes nothing yet.
 */
export function createCachePushConsumer({
	ctx,
}: {
	ctx: {
		catalogCache: Pick<CatalogCache, "read" | "load">;
		logger: Pick<AutumnLogger, "debug">;
	};
}): StreamConsumer {
	async function handle({
		records,
	}: {
		records: StreamRecord[];
	}): Promise<void> {
		const subjectKeys = batchToSubjectKeys({ records });
		ctx.logger.debug(
			{
				type: "herald_cache_push_skipped",
				data: { subjects: subjectKeys.length },
			},
			"Cache push is not built yet; the batch's subjects were not pushed",
		);
	}

	return { name: "cache-push", handle };
}
