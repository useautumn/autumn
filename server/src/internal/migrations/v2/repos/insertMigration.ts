import {
	type Migration,
	type MigrationInsert,
	migrations,
} from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext.js";
import { generateId } from "@/utils/genUtils.js";

/**
 * Insert a new migration row and return the persisted entity. `filter`
 * and `operations` default to null — users typically create a migration
 * first, then author them via PATCH.
 */
export const insertMigration = async ({
	ctx,
	insert,
}: {
	ctx: RepoContext;
	insert: Pick<
		MigrationInsert,
		"id" | "filter" | "operations" | "no_billing_changes"
	>;
}): Promise<Migration> => {
	const row: MigrationInsert = {
		internal_id: generateId("mig"),
		id: insert.id,
		org_id: ctx.org.id,
		env: ctx.env,
		filter: insert.filter ?? null,
		operations: insert.operations ?? null,
		no_billing_changes: insert.no_billing_changes ?? null,
		retry_failed: false,
		archived: false,
		created_at: Date.now(),
		updated_at: null,
	};

	await ctx.db.insert(migrations).values(row);

	return row as Migration;
};
