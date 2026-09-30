import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBatchEligibleMigrationDefinition } from "../../utils/shouldRunBatchLane.js";
import { resolveMigrationStatusFromRunState } from "../migrationStatus/resolveMigrationStatus.js";
import { summarizeMigration } from "./summarizeMigration.js";
import type { MigrationListContext } from "./types/migrationListContext.js";
import type { MigrationListItem } from "./types/migrationListItem.js";

export const computeMigrationListItem = ({
	ctx,
	migration,
	listContext,
}: {
	ctx: AutumnContext;
	migration: Migration;
	listContext: MigrationListContext;
}): MigrationListItem => {
	const { status, blockedByMigrationInternalId } =
		resolveMigrationStatusFromRunState({
			migrationInternalId: migration.internal_id,
			runState: listContext,
		});
	const blocker = listContext.migrations.find(
		(candidate) => candidate.internal_id === blockedByMigrationInternalId,
	);

	return {
		...migration,
		status,
		blocked_by: blocker?.id ?? blockedByMigrationInternalId,
		has_live_runs: listContext.itemRunCounts.some(
			(row) =>
				row.migration_internal_id === migration.internal_id && !row.dry_run,
		),
		summary: summarizeMigration({ migration, listContext }),
		batch_eligible: isBatchEligibleMigrationDefinition({
			migration,
			products: listContext.products,
			features: ctx.features,
		}),
	};
};
