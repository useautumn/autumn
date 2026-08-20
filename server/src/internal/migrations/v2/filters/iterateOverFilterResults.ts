import type { SQL } from "drizzle-orm";
import { runWithTransientDbRetry } from "@/internal/migrations/v2/batchOperations/execute/utils/runWithTransientDbRetry.js";
import {
	MIGRATION_FILTER_PAGE_TRANSIENT_DB_ATTEMPTS,
	MIGRATION_FILTER_PAGE_TRANSIENT_DB_RETRY_DELAY_MS,
} from "@/internal/migrations/v2/run/utils/migrationRunConstants.js";

export const DEFAULT_BATCH_SIZE = 10_000;

/**
 * Iterate keyset-paginated rows in batches. Caller supplies a `buildSelect`
 * closure that returns the SQL for the next page given a cursor; rows
 * MUST include `internal_id` for the cursor to advance.
 */
export async function* iterateOverFilterResults<
	TRow extends { internal_id: string },
>({
	db,
	buildSelect,
	batchSize = DEFAULT_BATCH_SIZE,
	afterInternalId,
	retryAttempts = MIGRATION_FILTER_PAGE_TRANSIENT_DB_ATTEMPTS,
	retryDelayMs = MIGRATION_FILTER_PAGE_TRANSIENT_DB_RETRY_DELAY_MS,
	onRetry,
}: {
	db: { execute: (query: SQL) => Promise<unknown> };
	buildSelect: (args: { limit: number; afterInternalId?: string }) => SQL;
	batchSize?: number;
	afterInternalId?: string;
	retryAttempts?: number;
	retryDelayMs?: number;
	onRetry?: (args: {
		error: unknown;
		attempt: number;
		maxAttempts: number;
	}) => void;
}): AsyncGenerator<TRow[]> {
	let cursor = afterInternalId;
	while (true) {
		const query = buildSelect({ limit: batchSize, afterInternalId: cursor });
		const rows = (await runWithTransientDbRetry({
			maxAttempts: retryAttempts,
			delayMs: retryDelayMs,
			onRetry,
			run: () => db.execute(query),
		})) as unknown as TRow[];
		if (rows.length === 0) return;
		yield rows;
		if (rows.length < batchSize) return;
		cursor = rows[rows.length - 1].internal_id;
	}
}
