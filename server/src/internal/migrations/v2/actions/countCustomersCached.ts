import type { CustomerFilter, CustomerListFilters } from "@autumn/shared";
import {
	buildMigrationFilterCountCacheKey,
	getCachedMigrationFilterCount,
	setCachedMigrationFilterCount,
} from "@/external/redis/actions/migrationFilterCountCache/migrationFilterCountCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	CustomerExecutionStatus,
	IncludeProcessed,
} from "../filters/customers/buildCustomerSelect.js";
import { countCustomers } from "../filters/customers/filterCustomers.js";

export type CustomerCountCacheScope = {
	migrationId?: string;
	source?: "filter" | "item_runs";
	executionStatuses?: CustomerExecutionStatus[];
	migrationRunId?: string;
	migrationRunDryRun?: boolean;
};

export const countCustomersCached = async ({
	ctx,
	filter,
	search,
	customerFilters,
	includeProcessed,
	cacheScope,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	search?: string;
	customerFilters?: CustomerListFilters;
	includeProcessed?: IncludeProcessed;
	cacheScope: CustomerCountCacheScope;
}): Promise<number> => {
	const cacheKey = buildMigrationFilterCountCacheKey({
		orgId: ctx.org.id,
		env: ctx.env,
		countInputs: { filter, search, customerFilters, ...cacheScope },
	});

	const cached = await getCachedMigrationFilterCount({ cacheKey });
	if (cached !== null) return cached;

	const count = await countCustomers({
		ctx,
		filter,
		search,
		customerFilters,
		includeProcessed,
	});
	await setCachedMigrationFilterCount({ cacheKey, count });
	return count;
};
