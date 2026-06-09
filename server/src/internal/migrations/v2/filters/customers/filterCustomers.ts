import type { CustomerFilter } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerListFilters } from "@/internal/customers/customerListFilters.js";
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

const buildArgs = ({
	ctx,
	filter,
	checkpoint,
	search,
	customerFilters,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	customerFilters?: CustomerListFilters;
}) => ({
	orgId: ctx.org.id,
	env: ctx.env,
	filter,
	checkpoint,
	search,
	customerFilters,
	ctx: { features: ctx.features },
});

type CustomerSelectArgs = ReturnType<typeof buildArgs>;

const buildRowsSelect = ({
	args,
	includeProcessed,
	limit,
	afterInternalId,
}: {
	args: CustomerSelectArgs;
	includeProcessed?: IncludeProcessed;
	limit?: number;
	afterInternalId?: string;
}) =>
	includeProcessed
		? buildProcessedPreviewSelect({
				...args,
				includeProcessed,
				limit,
				afterInternalId,
			})
		: buildCustomerSelect({ ...args, limit, afterInternalId });

/**
 * Pure inner: takes a CustomerFilter directly. Used by `runFilter` shim
 * (Migration-fed) and reusable from scripts that don't have a Migration.
 */
export const filterCustomers = ({
	ctx,
	filter,
	checkpoint,
	search,
	customerFilters,
	includeProcessed,
	batchSize,
	limit,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	customerFilters?: CustomerListFilters;
	includeProcessed?: IncludeProcessed;
	batchSize?: number;
	limit?: number;
}): AsyncGenerator<CustomerRow[]> => {
	const args = buildArgs({ ctx, filter, checkpoint, search, customerFilters });
	const source = iterateOverFilterResults<CustomerRow>({
		db: ctx.db,
		buildSelect: ({ limit, afterInternalId }) =>
			buildRowsSelect({ args, includeProcessed, limit, afterInternalId }),
		batchSize:
			limit === undefined ? batchSize : Math.min(batchSize ?? limit, limit),
	});
	return limit === undefined ? source : takeRows(source, limit);
};

export const getCustomerPage = async ({
	ctx,
	filter,
	checkpoint,
	search,
	customerFilters,
	includeProcessed,
	pageSize,
	cursor,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	customerFilters?: CustomerListFilters;
	includeProcessed?: IncludeProcessed;
	pageSize: number;
	cursor?: string;
}): Promise<{ rows: CustomerRow[]; nextCursor: string | null }> => {
	const args = buildArgs({ ctx, filter, checkpoint, search, customerFilters });
	const rows = (await ctx.db.execute(
		buildRowsSelect({
			args,
			includeProcessed,
			limit: pageSize + 1,
			afterInternalId: cursor || undefined,
		}),
	)) as CustomerRow[];
	const pageRows = rows.slice(0, pageSize);
	return {
		rows: pageRows,
		nextCursor:
			rows.length > pageSize
				? (pageRows[pageRows.length - 1]?.internal_id ?? null)
				: null,
	};
};

/** Count of customers matching `filter`. */
export const countCustomers = async ({
	ctx,
	filter,
	checkpoint,
	search,
	customerFilters,
	includeProcessed,
	limit,
}: {
	ctx: AutumnContext;
	filter: CustomerFilter;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	customerFilters?: CustomerListFilters;
	includeProcessed?: IncludeProcessed;
	limit?: number;
}): Promise<number> => {
	const args = buildArgs({ ctx, filter, checkpoint, search, customerFilters });
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
