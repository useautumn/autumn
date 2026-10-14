import { MigrationRunStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { migrationRunRepo } from "../../repos/index.js";

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
