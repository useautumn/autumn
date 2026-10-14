import {
	type Migration,
	type MigrationInsert,
	migrations,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

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
			| "archived"
		>
	>;
}): Promise<Migration | null> => {
	const where = [
		eq(migrations.id, id),
		eq(migrations.org_id, ctx.org.id),
		eq(migrations.env, ctx.env),
	];

	if (updates.archived === undefined) {
		where.push(eq(migrations.archived, false));
	}

	const [row] = await ctx.db
		.update(migrations)
		.set({ ...updates, updated_at: Date.now() })
		.where(and(...where))
		.returning();

	return row ?? null;
};
