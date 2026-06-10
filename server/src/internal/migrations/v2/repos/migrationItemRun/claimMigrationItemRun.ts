import {
	type MigrationItemKind,
	type MigrationItemRun,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { inArray, sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";
import { generateId } from "@/utils/genUtils.js";
import type { RetryableMigrationItemRunStatus } from "../../run/utils/retryItemStatuses.js";
import { getMigrationItemRun } from "./getMigrationItemRun.js";

type MigrationItemRunRepoContext = RepoContext & {
	dbGeneral?: RepoContext["db"];
};

export type MigrationItemRunClaimBehavior = "claim_new" | "retry_statuses";

export type MigrationItemRunClaimResult =
	| { claimed: true; itemRun: MigrationItemRun }
	| { claimed: false; itemRun: MigrationItemRun | null };

export const claimMigrationItemRun = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	dryRun = false,
	itemKind,
	itemId,
	claimBehavior,
	retryStatuses = [],
}: {
	ctx: MigrationItemRunRepoContext;
	migrationInternalId: string;
	migrationRunId?: string;
	dryRun?: boolean;
	itemKind: MigrationItemKind;
	itemId: string;
	claimBehavior: MigrationItemRunClaimBehavior;
	retryStatuses?: RetryableMigrationItemRunStatus[];
}): Promise<MigrationItemRunClaimResult> => {
	if (dryRun && !migrationRunId)
		throw new Error(
			"migrationItemRunRepo.claim: dryRun requires migrationRunId",
		);

	const db = ctx.dbGeneral ?? ctx.db;
	const now = Date.now();
	const values = {
		migration_item_run_id: generateId("mir"),
		migration_internal_id: migrationInternalId,
		migration_run_id: migrationRunId ?? null,
		dry_run: dryRun,
		item_kind: itemKind,
		item_id: itemId,
		status: MigrationItemRunStatus.Running,
		created_at: now,
		updated_at: null,
	};
	const target = dryRun
		? [
				migrationItemRuns.migration_internal_id,
				migrationItemRuns.migration_run_id,
				migrationItemRuns.item_kind,
				migrationItemRuns.item_id,
			]
		: [
				migrationItemRuns.migration_internal_id,
				migrationItemRuns.item_kind,
				migrationItemRuns.item_id,
			];
	const targetWhere = dryRun
		? sql`${migrationItemRuns.dry_run} = true`
		: sql`${migrationItemRuns.dry_run} = false`;

	const shouldRetry =
		claimBehavior === "retry_statuses" && retryStatuses.length > 0;

	const [claimed] = shouldRetry
		? await db
				.insert(migrationItemRuns)
				.values(values)
				.onConflictDoUpdate({
					target,
					targetWhere,
					set: {
						migration_run_id: migrationRunId ?? null,
						status: MigrationItemRunStatus.Running,
						updated_at: now,
					},
					setWhere: inArray(migrationItemRuns.status, retryStatuses),
				})
				.returning()
		: await db
				.insert(migrationItemRuns)
				.values(values)
				.onConflictDoNothing({ target, where: targetWhere })
				.returning();

	if (claimed) return { claimed: true, itemRun: claimed };

	const itemRun = await getMigrationItemRun({
		ctx: { ...ctx, db },
		migrationInternalId,
		migrationRunId,
		dryRun,
		itemKind,
		itemId,
	});

	return { claimed: false, itemRun };
};
