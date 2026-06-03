import { MigrationRunStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRunRepo } from "../../repos/index.js";
import {
	clearMigrationCancelRequested,
	isMigrationCancelRequested,
} from "../../run/utils/migrationCancelToken.js";

export const withMigrationRunTracking = async <T>({
	ctx,
	migrationRunId,
	run,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	run: () => Promise<T>;
}): Promise<T> => {
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
		if (cancelRequested) {
			await clearMigrationCancelRequested({ migrationRunId });
		}
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
		throw error;
	}
};
