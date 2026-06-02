import type { CustomerFilter } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { iterateOverFilterResults } from "../iterateOverFilterResults.js";
import {
	buildCustomerCount,
	buildCustomerSelect,
	buildLimitedCustomerCount,
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
	limit,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	includeProcessed?: IncludeProcessed;
	batchSize?: number;
	limit?: number;
}): AsyncGenerator<CustomerRow[]> => {
	const args = {
		orgId: ctx.org.id,
		env: ctx.env,
		filter,
		checkpoint,
		search,
		ctx: { features: ctx.features },
	};
	const source = iterateOverFilterResults<CustomerRow>({
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
		batchSize:
			limit === undefined ? batchSize : Math.min(batchSize ?? limit, limit),
	});
	return limit === undefined ? source : takeRows(source, limit);
};

/** Count of customers matching `filter`. */
export const countCustomers = async ({
	ctx,
	filter,
	checkpoint,
	search,
	includeProcessed,
	limit,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	includeProcessed?: IncludeProcessed;
	limit?: number;
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
		: limit === undefined
			? buildCustomerCount(args)
			: buildLimitedCustomerCount({ ...args, limit });
	const [{ count }] = (await ctx.db.execute(query)) as Array<{
		count: bigint | number;
	}>;
	return Number(count);
};

async function* takeRows<TRow>(
	source: AsyncGenerator<TRow[]>,
	limit: number,
): AsyncGenerator<TRow[]> {
	let remaining = limit;
	if (remaining <= 0) return;

	for await (const batch of source) {
		const next = batch.slice(0, remaining);
		if (next.length > 0) yield next;
		remaining -= next.length;
		if (remaining <= 0) return;
	}
}
