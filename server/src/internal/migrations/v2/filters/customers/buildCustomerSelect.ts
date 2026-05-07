import type { CustomerFilter } from "@autumn/shared";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import type { ResolutionContext } from "@autumn/shared/api/migrations/compiler/filterToIr/resolutionContext.js";
import { type SQL, sql } from "drizzle-orm";
import { rawWithParamsToDrizzle } from "../rawWithParamsToDrizzle.js";

export type CustomerQueryArgs = {
	orgId: string;
	env: string;
	filter: CustomerFilter;
	ctx: ResolutionContext;
};

const compileWhere = ({ orgId, env, filter, ctx }: CustomerQueryArgs): SQL =>
	rawWithParamsToDrizzle(
		compileFilter({ filter, ctx, ambient: { orgId, env } }),
	);

/**
 * Full SELECT. Returns `{ internal_id, id }` rows newest-first via keyset
 * pagination on `c.internal_id DESC`, so successive iterations over an
 * unchanged customer set yield rows in the same order.
 */
export const buildCustomerSelect = ({
	orgId,
	env,
	filter,
	ctx,
	limit,
	afterInternalId,
}: CustomerQueryArgs & {
	limit?: number;
	afterInternalId?: string;
}): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	const cursor = afterInternalId
		? sql`AND c.internal_id < ${afterInternalId}`
		: sql``;
	const limitClause = limit !== undefined ? sql`LIMIT ${limit}` : sql``;
	return sql`
		SELECT c.internal_id, c.id
		FROM customers c
		WHERE (${where}) ${cursor}
		ORDER BY c.internal_id DESC
		${limitClause}
	`;
};

/** COUNT(*) applying the same filter. */
export const buildCustomerCount = ({
	orgId,
	env,
	filter,
	ctx,
}: CustomerQueryArgs): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	return sql`
		SELECT COUNT(*)::bigint AS count
		FROM customers c
		WHERE (${where})
	`;
};
