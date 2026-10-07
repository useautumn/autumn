import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";

/** Which rows a probe may answer with: this build's version, written after the moment the table was last trusted from. */
export type SubjectSnapshotProbe = {
	stateVersion: number;
	/** Epoch ms; rows written at or before it are passed over as if absent. */
	writtenAfter: number;
};

/** The `WHERE` tail every probe shares: the row's version and age, after its key. */
export const subjectSnapshotProbeSql = ({
	probe,
}: {
	probe: SubjectSnapshotProbe;
}): SQL => sql`s.state_version = ${probe.stateVersion}
		AND s.written_at > ${probe.writtenAfter}`;

/** The subject's snapshot state as the probe allows, or null: no row, or a row another build or an earlier period wrote. One PK probe. */
export const readSubjectSnapshot = async ({
	ctx,
	customerId,
	entityId,
	probe,
}: {
	ctx: PostgresContext;
	customerId: string;
	entityId: string | null;
	probe: SubjectSnapshotProbe;
}): Promise<unknown | null> => {
	const { rows } = await ctx.db.execute(
		readSubjectSnapshotSql({ ctx, customerId, entityId, probe }),
	);
	return rows[0]?.state ?? null;
};

/** COLLATE "C" on the probe side so the primary key, which is "C", serves the lookup. */
export const readSubjectSnapshotSql = ({
	ctx,
	customerId,
	entityId,
	probe,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
	customerId: string;
	entityId: string | null;
	probe: SubjectSnapshotProbe;
}): SQL => sql`SELECT s.state
	FROM subject_snapshots s
	WHERE s.org_id = ${ctx.orgId} COLLATE "C"
		AND s.env = ${ctx.env} COLLATE "C"
		AND s.customer_id = ${customerId} COLLATE "C"
		AND s.entity_id = ${entityId ?? ""} COLLATE "C"
		AND ${subjectSnapshotProbeSql({ probe })}`;
