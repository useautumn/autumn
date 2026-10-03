import { sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";

/** The entity of each row the customer has, null for the customer's own; a primary-key prefix scan, no join. */
export const listSubjectSnapshotEntityIds = async ({
	ctx,
	customerId,
}: {
	ctx: PostgresContext;
	customerId: string;
}): Promise<(string | null)[]> => {
	const rows = (await ctx.db.execute(sql`SELECT s.entity_id
	FROM subject_snapshots s
	WHERE s.org_id = ${ctx.orgId} COLLATE "C"
		AND s.env = ${ctx.env} COLLATE "C"
		AND s.customer_id = ${customerId} COLLATE "C"
	ORDER BY s.entity_id`)) as { entity_id: string }[];
	return rows.map((row) => (row.entity_id === "" ? null : row.entity_id));
};
