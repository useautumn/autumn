import {
	ErrCode,
	type Migration,
	MigrationRunErrorCode,
	MigrationRunStatus,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { migrationRunRepo } from "../../repos/index.js";
import { classifyMigrationRunError } from "./classifyMigrationRunError.js";
import {
	type PersistTriggerRunId,
	persistDispatchHandle,
} from "./persistDispatchHandle.js";
import {
	type TriggerRunLookup,
	verifyTriggerRunExists,
} from "./verifyTriggerRunExists.js";

const failRun = async ({
	ctx,
	migrationRunId,
	message,
	errorCode,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	message: string;
	errorCode: MigrationRunErrorCode;
}) =>
	migrationRunRepo.update({
		ctx,
		internalId: migrationRunId,
		updates: {
			status: MigrationRunStatus.Failed,
			error_message: message,
			error_code: errorCode,
			finished_at: Date.now(),
		},
	});

export const withMigrationRunClaim = async ({
	ctx,
	migration,
	dryRun,
	lazyRun = false,
	onlyIds,
	targetLimit,
	claimed,
	verifyDispatch = verifyTriggerRunExists,
	persistTriggerRunId,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dryRun: boolean;
	lazyRun?: boolean;
	onlyIds?: string[] | null;
	targetLimit?: number;
	claimed: (
		migrationRunId: string,
	) => Promise<{ triggerRunId?: string } | undefined>;
	verifyDispatch?: (triggerRunId: string) => Promise<TriggerRunLookup>;
	persistTriggerRunId?: PersistTriggerRunId;
}): Promise<{ migrationRunId: string; triggerRunId?: string }> => {
	const migrationRun = await migrationRunRepo.insert({
		ctx,
		insert: {
			migration_internal_id: migration.internal_id,
			dry_run: dryRun,
			lazy_run: lazyRun,
			only_ids: onlyIds && onlyIds.length > 0 ? onlyIds : null,
			target_limit: targetLimit,
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

	let result: { triggerRunId?: string } | undefined;
	try {
		result = await claimed(migrationRun.internal_id);
	} catch (error) {
		await failRun({
			ctx,
			migrationRunId: migrationRun.internal_id,
			message: error instanceof Error ? error.message : String(error),
			errorCode: classifyMigrationRunError({ error }),
		});
		throw error;
	}

	if (result?.triggerRunId) {
		const dispatched = await verifyDispatch(result.triggerRunId);
		if (dispatched === "not_found") {
			const message = `Migration run dispatch could not be verified: trigger run ${result.triggerRunId} was not found`;
			await failRun({
				ctx,
				migrationRunId: migrationRun.internal_id,
				message,
				errorCode: MigrationRunErrorCode.DispatchFailed,
			});
			throw new RecaseError({
				message,
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}
	}

	if (lazyRun) {
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRun.internal_id,
			updates: {
				status: MigrationRunStatus.Running,
				started_at: Date.now(),
			},
		});
	}

	if (result?.triggerRunId) {
		await persistDispatchHandle({
			ctx,
			migrationRunId: migrationRun.internal_id,
			triggerRunId: result.triggerRunId,
			persist: persistTriggerRunId,
		});
	}

	if (lazyRun) {
		await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });
	}

	return {
		migrationRunId: migrationRun.internal_id,
		triggerRunId: result?.triggerRunId,
	};
};
