import {
	type Migration,
	type MigrationInsert,
	migrations,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/**
 * Patch a migration. Drizzle's `set()` only updates keys present in the
 * passed object, so callers pass only the fields they want changed.
 * Scoped to the current org + env. Returns the persisted row, or null
 * if not found.
 */
export const updateMigration = async ({
	ctx,
	id,
	updates,
}: {
	ctx: RepoContext;
	id: string;
	updates: Partial<
		Pick<
			MigrationInsert,
			| "id"
			| "filter"
			| "operations"
			| "prepared_state"
			| "retry_failed"
			| "no_billing_changes"
		>
	>;
}): Promise<Migration | null> => {
	const [row] = await ctx.db
		.update(migrations)
		.set({ ...updates, updated_at: Date.now() })
		.where(
			and(
				eq(migrations.id, id),
				eq(migrations.org_id, ctx.org.id),
				eq(migrations.env, ctx.env),
			),
		)
		.returning();

	return row ?? null;
};
