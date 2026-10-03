import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";

/** The subject's snapshot state at `stateVersion` as stored, or null: no row, or a row another build wrote. One PK probe. */
export const readSubjectSnapshot = async ({
	ctx,
	customerId,
	entityId,
	stateVersion,
}: {
	ctx: PostgresContext;
	customerId: string;
	entityId: string | null;
	stateVersion: number;
}): Promise<unknown | null> => {
	const { rows } = await ctx.db.execute(
		readSubjectSnapshotSql({ ctx, customerId, entityId, stateVersion }),
	);
	return rows[0]?.state ?? null;
};

/** COLLATE "C" on the probe side so the primary key, which is "C", serves the lookup. */
export const readSubjectSnapshotSql = ({
	ctx,
	customerId,
	entityId,
	stateVersion,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
	customerId: string;
	entityId: string | null;
	stateVersion: number;
}): SQL => sql`SELECT s.state
	FROM subject_snapshots s
	WHERE s.org_id = ${ctx.orgId} COLLATE "C"
		AND s.env = ${ctx.env} COLLATE "C"
		AND s.customer_id = ${customerId} COLLATE "C"
		AND s.entity_id = ${entityId ?? ""} COLLATE "C"
		AND s.state_version = ${stateVersion}`;
