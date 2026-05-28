import type { CustomerFilter } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { iterateOverFilterResults } from "../iterateOverFilterResults.js";
import {
	buildCustomerCount,
	buildCustomerSelect,
	buildProcessedPreviewCount,
	buildProcessedPreviewSelect,
	type CustomerCheckpointExclusion,
	type IncludeProcessed,
} from "./buildCustomerSelect.js";

export type CustomerRow = {
	internal_id: string;
	id: string | null;
	name: string | null;
	email: string | null;
};

/**
 * Pure inner: takes a CustomerFilter directly. Used by `runFilter` shim
 * (Migration-fed) and reusable from scripts that don't have a Migration.
 */
export const filterCustomers = ({
	ctx,
	filter,
	checkpoint,
	search,
	includeProcessed,
	batchSize,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	includeProcessed?: IncludeProcessed;
	batchSize?: number;
}): AsyncGenerator<CustomerRow[]> => {
	const args = {
		orgId: ctx.org.id,
		env: ctx.env,
		filter,
		checkpoint,
		search,
		ctx: { features: ctx.features },
	};
	return iterateOverFilterResults<CustomerRow>({
		db: ctx.db,
		buildSelect: ({ limit, afterInternalId }) =>
			includeProcessed
				? buildProcessedPreviewSelect({
						...args,
						includeProcessed,
						limit,
						afterInternalId,
					})
				: buildCustomerSelect({ ...args, limit, afterInternalId }),
		batchSize,
	});
};

/** Count of customers matching `filter`. */
export const countCustomers = async ({
	ctx,
	filter,
	checkpoint,
	search,
	includeProcessed,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	includeProcessed?: IncludeProcessed;
}): Promise<number> => {
	const args = {
		orgId: ctx.org.id,
		env: ctx.env,
		filter,
		checkpoint,
		search,
		ctx: { features: ctx.features },
	};
	const query = includeProcessed
		? buildProcessedPreviewCount({ ...args, includeProcessed })
		: buildCustomerCount(args);
	const [{ count }] = (await ctx.db.execute(query)) as Array<{
		count: bigint | number;
	}>;
	return Number(count);
};
