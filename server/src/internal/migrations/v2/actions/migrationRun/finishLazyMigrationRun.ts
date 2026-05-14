import { MigrationRunStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { migrationRunRepo } from "../../repos/index.js";

/**
 * Mark a lazy migration run as terminally done and bust the org's api-key
 * cache so `ctx.org.pendingMigrations` drops it on the next authed request.
 *
 * This is the "done with this lazy migration" hook — after calling, the
 * customer-fetch hot path stops checking item_runs for this migration.
 *
 * Idempotent: if the run is already at a terminal status the update is a
 * no-op; we still clear the org cache so callers can use this as a forced
 * reload mechanism.
 */
export const finishLazyMigrationRun = async ({
	ctx,
	runId,
	status = MigrationRunStatus.Succeeded,
	errorMessage,
}: {
	ctx: AutumnContext;
	runId: string;
	status?: MigrationRunStatus;
	errorMessage?: string;
}): Promise<void> => {
	await migrationRunRepo.update({
		ctx,
		internalId: runId,
		updates: {
			status,
			finished_at: Date.now(),
			...(errorMessage ? { error_message: errorMessage } : {}),
		},
	});

	await clearOrgCache({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
};
