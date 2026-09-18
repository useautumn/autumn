import type { PostgresExecutor } from "../../../types/postgresClient.js";
import type { SubjectRowUpdate } from "../../types/subjectRowUpdate.js";
import { subjectRowUpdateSql } from "./subjectRowUpdateSql.js";

/** Runs each guarded update in order on the caller's executor; `applied[i]` is false when update i failed its guard. */
export const applySubjectRowUpdates = async ({
	ctx,
	updates,
}: {
	ctx: { db: PostgresExecutor };
	updates: readonly SubjectRowUpdate[];
}): Promise<{ applied: boolean[] }> => {
	const applied: boolean[] = [];
	for (const update of updates) {
		const rows = await ctx.db.execute(subjectRowUpdateSql({ update }));
		applied.push(rows[0]?.id === update.id);
	}
	return { applied };
};
