import {
	ErrCode,
	type Migration,
	MigrationRunStatus,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRunRepo } from "../../repos/index.js";

type TriggerHandle = {
	id: string;
};

export const withMigrationRunClaim = async <THandle extends TriggerHandle>({
	ctx,
	migration,
	dryRun,
	trigger,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dryRun: boolean;
	trigger: (migrationRunId: string) => Promise<THandle>;
}): Promise<{ migrationRunId: string; handle: THandle }> => {
	const migrationRun = await migrationRunRepo.insert({
		ctx,
		insert: {
			migration_internal_id: migration.internal_id,
			dry_run: dryRun,
		},
	});

	if (!migrationRun) {
		throw new RecaseError({
			message:
				"A migration is already running. Please try again when it completes.",
			code: ErrCode.MigrationAlreadyInProgress,
			statusCode: 409,
		});
	}

	let handle: THandle;
	try {
		handle = await trigger(migrationRun.internal_id);
	} catch (error) {
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRun.internal_id,
			updates: {
				status: MigrationRunStatus.Failed,
				error_message: error instanceof Error ? error.message : String(error),
				finished_at: Date.now(),
			},
		});
		throw error;
	}

	try {
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRun.internal_id,
			updates: {
				trigger_run_id: handle.id,
			},
		});
	} catch (error) {
		ctx.logger.error("run-migration: failed to persist trigger run id", {
			data: {
				migrationRunId: migrationRun.internal_id,
				triggerRunId: handle.id,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}

	return { migrationRunId: migrationRun.internal_id, handle };
};
