import { MigrationRunStatus } from "@autumn/shared";
import {
	clearMigrationCancelRequested,
	isMigrationCancelRequested,
} from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRunRepo } from "../../repos/index.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";

/** Owns the run lifecycle: status transitions AND their logs. `logData` adds
 * caller context; an object-shaped run result is spread into the final log. */
export const withMigrationRunTracking = async <T>({
	ctx,
	migrationRunId,
	logData,
	run,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
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
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRunId,
			updates: cancelRequested
				? {
						status: MigrationRunStatus.Canceled,
						error_message: "Canceled by user",
						finished_at: Date.now(),
					}
				: {
						status: MigrationRunStatus.Succeeded,
						finished_at: Date.now(),
					},
		});
		await settleLeftoverClaims({ ctx, migrationRunId });
		if (cancelRequested) {
			await clearMigrationCancelRequested({ migrationRunId });
		}

		ctx.logger.info(
			`migration-run: ${cancelRequested ? "canceled" : "succeeded"}`,
			{
				data: {
					migrationRunId,
					...logData,
					...(result !== null && typeof result === "object" ? result : {}),
				},
			},
		);

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
