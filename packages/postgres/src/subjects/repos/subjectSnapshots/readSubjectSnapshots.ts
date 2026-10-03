import { sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";
import type { SubjectSnapshotRow } from "../../types/subjectSnapshot.js";

type SubjectSnapshotKey = Pick<
	SubjectSnapshotRow,
	"orgId" | "env" | "customerId" | "entityId"
>;

/**
 * The rows that exist among `keys` at `stateVersion`, in no order; a key with no row, or a row another build wrote,
 * is simply absent. One statement whatever the batch.
 */
export const readSubjectSnapshots = async ({
	ctx,
	keys,
	stateVersion,
}: {
	ctx: Pick<PostgresContext, "db">;
	keys: readonly SubjectSnapshotKey[];
	stateVersion: number;
}): Promise<SubjectSnapshotRow[]> => {
	if (keys.length === 0) return [];
	const rows = await ctx.db.execute(
		readSubjectSnapshotsSql({ keys, stateVersion }),
	);
	return rows.map((row) => ({
		orgId: String(row.org_id),
		env: String(row.env),
		customerId: String(row.customer_id),
		entityId: row.entity_id === "" ? null : String(row.entity_id),
		state: row.state,
		baselineAt: Number(row.baseline_at),
	}));
};

/** COLLATE "C" on the probe side so the PK, which is "C", serves the join: one index probe per key, never a scan. */
export const readSubjectSnapshotsSql = ({
	keys,
	stateVersion,
}: {
	keys: readonly SubjectSnapshotKey[];
	stateVersion: number;
}) => {
	const document = JSON.stringify(
		keys.map((key) => ({
			org_id: key.orgId,
			env: key.env,
			customer_id: key.customerId,
			entity_id: key.entityId ?? "",
		})),
	);
	return sql`SELECT s.org_id, s.env, s.customer_id, s.entity_id, s.state, s.baseline_at
		FROM subject_snapshots s
		JOIN jsonb_to_recordset(${document}::text::jsonb) AS k(org_id text, env text, customer_id text, entity_id text)
			ON s.org_id = k.org_id COLLATE "C"
			AND s.env = k.env COLLATE "C"
			AND s.customer_id = k.customer_id COLLATE "C"
			AND s.entity_id = k.entity_id COLLATE "C"
		WHERE s.state_version = ${stateVersion}`;
};
