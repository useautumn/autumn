import type { Migration } from "@autumn/shared";
import pLimit from "p-limit";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { countCustomersCached } from "../countCustomersCached.js";

const CUSTOMER_COUNT_CONCURRENCY = 4;

const countMatchedCustomers = async ({
	ctx,
	migration,
}: {
	ctx: AutumnContext;
	migration: Migration;
}): Promise<number | null> => {
	const filter = migration.filter?.customer;
	const hasFilter =
		filter !== undefined &&
		Object.values(filter).some((value) => value !== undefined);
	if (migration.archived || !hasFilter) return null;

	try {
		return await countCustomersCached({
			ctx,
			filter,
			includeProcessed: { migrationInternalId: migration.internal_id },
			cacheScope: {
				migrationId: migration.id,
				source: "filter",
				executionStatuses: [],
			},
		});
	} catch (error) {
		ctx.logger.warn(`Migration ${migration.id} customer count failed`, {
			error,
		});
		return null;
	}
};

/** Filter ∪ processed customer count per migration, keyed by internal id. */
export const listMigrationCustomerCounts = async ({
	ctx,
	migrations,
}: {
	ctx: AutumnContext;
	migrations: Migration[];
}): Promise<Map<string, number | null>> => {
	const limit = pLimit(CUSTOMER_COUNT_CONCURRENCY);
	const counts = await Promise.all(
		migrations.map((migration) =>
			limit(() => countMatchedCustomers({ ctx, migration })),
		),
	);
	return new Map(
		migrations.map((migration, index) => [
			migration.internal_id,
			counts[index],
		]),
	);
};
