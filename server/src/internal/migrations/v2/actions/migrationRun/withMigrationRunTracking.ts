import { MigrationRunStatus } from "@autumn/shared";
import {
	clearMigrationCancelRequested,
	isMigrationCancelRequested,
} from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo, migrationRunRepo } from "../../repos/index.js";
import { resolveRunOutcomeStatus } from "./resolveRunOutcomeStatus.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";

/** Counts are advisory: a lookup failure must not turn a run that completed
 * into a failed one, so it falls back to the historical `succeeded`. */
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

/** Owns the run lifecycle: status transitions AND their logs. `logData` adds
 * caller context; an object-shaped run result is spread into the final log. */
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

		// In-flight items have drained. If cancellation was requested mid-run,
		// settle as `canceled` rather than `succeeded`.
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
				...(cancelRequested && { error_message: "Canceled by user" }),
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
