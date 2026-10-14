import { MigrationRunErrorCode, MigrationRunStatus } from "@autumn/shared";
import {
	clearMigrationCancelRequested,
	isMigrationCancelRequested,
} from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo, migrationRunRepo } from "../../repos/index.js";
import { classifyMigrationRunError } from "./classifyMigrationRunError.js";
import { resolveRunOutcomeStatus } from "./resolveRunOutcomeStatus.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";

const resolveCompletedRunStatus = async ({
	ctx,
	migrationRunId,
	migrationInternalId,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	migrationInternalId?: string;
}): Promise<MigrationRunStatus> => {
	if (!migrationInternalId) return MigrationRunStatus.Succeeded;
	try {
		const counts = await migrationItemRunRepo.getCounts({
			ctx,
			migrationInternalId,
			migrationRunId,
		});
		return resolveRunOutcomeStatus(counts);
	} catch (error) {
		ctx.logger.warn("migration-run: could not read item counts for status", {
			data: {
				migrationRunId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return MigrationRunStatus.Succeeded;
	}
};

export const withMigrationRunTracking = async <T>({
	ctx,
	migrationRunId,
	migrationInternalId,
	logData,
	run,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	migrationInternalId?: string;
	logData?: Record<string, unknown>;
	run: () => Promise<T>;
}): Promise<T> => {
	ctx.logger.info("migration-run: started", {
		data: { migrationRunId, ...logData },
	});

	await migrationRunRepo.update({
		ctx,
		internalId: migrationRunId,
		updates: {
			status: MigrationRunStatus.Running,
			started_at: Date.now(),
		},
	});

	try {
		const result = await run();

		const cancelRequested = await isMigrationCancelRequested({
			migrationRunId,
		});
		const outcomeStatus = cancelRequested
			? MigrationRunStatus.Canceled
			: await resolveCompletedRunStatus({
					ctx,
					migrationRunId,
					migrationInternalId,
				});
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRunId,
			updates: {
				status: outcomeStatus,
				finished_at: Date.now(),
				...(cancelRequested && {
					error_message: "Canceled by user",
					error_code: MigrationRunErrorCode.Canceled,
				}),
			},
		});
		await settleLeftoverClaims({ ctx, migrationRunId });
		if (cancelRequested) {
			await clearMigrationCancelRequested({ ctx, migrationRunId });
		}

		ctx.logger.info(`migration-run: ${outcomeStatus}`, {
			data: {
				migrationRunId,
				...logData,
				...(result !== null && typeof result === "object" ? result : {}),
			},
		});

		return result;
	} catch (error) {
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRunId,
			updates: {
				status: MigrationRunStatus.Failed,
				error_message: error instanceof Error ? error.message : String(error),
				error_code: classifyMigrationRunError({ error }),
				finished_at: Date.now(),
			},
		});
		await settleLeftoverClaims({ ctx, migrationRunId });

		ctx.logger.error("migration-run: failed", {
			data: {
				migrationRunId,
				...logData,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}
};
