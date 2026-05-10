import { MigrationRunStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRunRepo } from "../../repos/index.js";

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
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRunId,
			updates: {
				status: MigrationRunStatus.Succeeded,
				finished_at: Date.now(),
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
		throw error;
	}
};
