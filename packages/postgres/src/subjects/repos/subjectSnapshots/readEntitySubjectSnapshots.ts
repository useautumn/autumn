import { sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";
import {
	type SubjectSnapshotProbe,
	subjectSnapshotProbeSql,
} from "./readSubjectSnapshot.js";

export const readEntitySubjectSnapshots = async ({
	ctx,
	customerId,
	entityIds,
	probe,
}: {
	ctx: PostgresContext;
	customerId: string;
	entityIds: readonly string[];
	probe: SubjectSnapshotProbe;
}): Promise<Map<string, unknown>> => {
	if (entityIds.length === 0) return new Map();
	const idList = sql`string_to_array(${entityIds.join(",")}, ',')`;
	const { rows } = await ctx.db.execute(sql`SELECT s.entity_id, s.state
	FROM subject_snapshots s
	WHERE s.org_id = ${ctx.orgId} COLLATE "C"
		AND s.env = ${ctx.env} COLLATE "C"
		AND s.customer_id = ${customerId} COLLATE "C"
		AND s.entity_id = ANY(${idList})
		AND ${subjectSnapshotProbeSql({ probe })}`);
	return new Map(
		(rows as { entity_id: string; state: unknown }[]).map((row) => [
			row.entity_id,
			row.state,
		]),
	);
};
