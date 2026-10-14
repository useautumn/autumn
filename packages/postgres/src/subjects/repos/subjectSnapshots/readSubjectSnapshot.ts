import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";

export type SubjectSnapshotProbe = {
	stateVersion: number;
	writtenAfter: number;
};

export const subjectSnapshotProbeSql = ({
	probe,
}: {
	probe: SubjectSnapshotProbe;
}): SQL => sql`s.state_version = ${probe.stateVersion}
		AND s.written_at > ${probe.writtenAfter}`;

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
