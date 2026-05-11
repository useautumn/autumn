import {
	type MigrationItemKind,
	type MigrationItemRun,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";
import { getMigrationItemRun } from "./getMigrationItemRun.js";

export type MigrationItemRunClaimBehavior = "claim_new" | "retry_failed";

export type MigrationItemRunClaimResult =
	| { claimed: true; itemRun: MigrationItemRun }
	| { claimed: false; itemRun: MigrationItemRun | null };

export const claimMigrationItemRun = async ({
	ctx,
	migrationInternalId,
	itemKind,
	itemId,
	claimBehavior,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	itemKind: MigrationItemKind;
	itemId: string;
	claimBehavior: MigrationItemRunClaimBehavior;
}): Promise<MigrationItemRunClaimResult> => {
	const now = Date.now();
	const values = {
		migration_internal_id: migrationInternalId,
		item_kind: itemKind,
		item_id: itemId,
		status: MigrationItemRunStatus.Running,
		created_at: now,
		updated_at: null,
	};

	const [claimed] =
		claimBehavior === "retry_failed"
			? await ctx.db
					.insert(migrationItemRuns)
					.values(values)
					.onConflictDoUpdate({
						target: [
							migrationItemRuns.migration_internal_id,
							migrationItemRuns.item_kind,
							migrationItemRuns.item_id,
						],
						set: {
							status: MigrationItemRunStatus.Running,
							updated_at: now,
						},
						where: eq(migrationItemRuns.status, MigrationItemRunStatus.Failed),
					})
					.returning()
			: await ctx.db
					.insert(migrationItemRuns)
					.values(values)
					.onConflictDoNothing()
					.returning();

	if (claimed) return { claimed: true, itemRun: claimed };

	const itemRun = await getMigrationItemRun({
		ctx,
		migrationInternalId,
		itemKind,
		itemId,
	});

	return { claimed: false, itemRun };
};
