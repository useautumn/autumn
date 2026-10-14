import type { Feature } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	buildLiveFilterCandidateQuery,
	LiveFilterCandidateCoreSchema,
	type LiveFilterCandidateRow,
	toLiveFilterCandidateRow,
} from "@/internal/migrations/v2/batchOperations/actions/utils/liveFilterCandidateSql.js";
import type { OperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { EntitlementPriceFilter } from "@/internal/migrations/v2/batchOperations/types/entitlementPriceFilter.js";

export type RemoveCandidateRow = LiveFilterCandidateRow;

type SelectRemoveCandidateRowsArgs = {
	internalCustomerIds: string[];
	scope: OperationScope;
	filter: EntitlementPriceFilter;
	features: Feature[];
	afterCustomerProductId?: string;
	limit: number;
};

const rowIsRemovableSql = sql`
	AND definition.pooled IS NOT TRUE
	AND NOT live.is_pooled_balance
	AND live.pooled_contribution_id IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM rollovers WHERE rollovers.cus_ent_id = live.id
	)
`;

export const buildRemoveCandidateRowsQuery = ({
	internalCustomerIds,
	scope,
	filter,
	afterCustomerProductId,
	limit,
}: Omit<SelectRemoveCandidateRowsArgs, "features">) =>
	buildLiveFilterCandidateQuery({
		internalCustomerIds,
		scope,
		filter,
		extraWhere: rowIsRemovableSql,
		afterCustomerProductId,
		limit,
	});

export const selectRemoveCandidateRows = async ({
	db,
	features,
	...args
}: SelectRemoveCandidateRowsArgs & {
	db: DrizzleCli;
}): Promise<RemoveCandidateRow[]> => {
	if (args.internalCustomerIds.length === 0) return [];

	const rows = await db.execute(buildRemoveCandidateRowsQuery(args));

	return rows.map((row) => {
		const parsed = LiveFilterCandidateCoreSchema.parse(row);
		return toLiveFilterCandidateRow({ parsed, features });
	});
};
