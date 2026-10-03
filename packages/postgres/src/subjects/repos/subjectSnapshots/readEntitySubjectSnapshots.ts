import { sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";

/**
 * The snapshot states at `stateVersion` of the customer's entities named, by entity id; an entity with no row, or a row
 * another build wrote, is absent. One primary-key range probe whatever the batch; the same statement for one or two hundred.
 */
export const readEntitySubjectSnapshots = async ({
	ctx,
	customerId,
	entityIds,
	stateVersion,
}: {
	ctx: PostgresContext;
	customerId: string;
	entityIds: readonly string[];
	stateVersion: number;
}): Promise<Map<string, unknown>> => {
	if (entityIds.length === 0) return new Map();
	// Bound the way entitySubjectRowsSql binds its id list; the driver has no text[] parameter.
	const idList = sql`string_to_array(${entityIds.join(",")}, ',')`;
	const rows = (await ctx.db.execute(sql`SELECT s.entity_id, s.state
	FROM subject_snapshots s
	WHERE s.org_id = ${ctx.orgId} COLLATE "C"
		AND s.env = ${ctx.env} COLLATE "C"
		AND s.customer_id = ${customerId} COLLATE "C"
		AND s.entity_id = ANY(${idList})
		AND s.state_version = ${stateVersion}`)) as {
		entity_id: string;
		state: unknown;
	}[];
	return new Map(rows.map((row) => [row.entity_id, row.state]));
};
