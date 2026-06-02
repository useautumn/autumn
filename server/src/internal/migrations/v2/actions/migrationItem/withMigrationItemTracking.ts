import type {
	MigrationItemEventResponse,
	MigrationItemEventStatus,
	MigrationItemPreview,
} from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	migrationItemEventRepo,
	migrationItemRunRepo,
} from "../../repos/index.js";
import type { RunScopeItem } from "../../run/types/runScope.js";
import {
	normalizeRetryItemStatuses,
	type RetryableMigrationItemRunStatus,
} from "../../run/utils/retryItemStatuses.js";

export type MigrationItemTrackingResult = {
	itemPreview: MigrationItemPreview | null;
	status: Exclude<MigrationItemEventStatus, "failed">;
	response: MigrationItemEventResponse;
};

const errorToResponse = (error: unknown): MigrationItemEventResponse => ({
	error: {
		message: error instanceof Error ? error.message : String(error),
	},
});

const itemToPreview = (item: RunScopeItem): MigrationItemPreview => ({
	id: item.id,
	name: null,
	email: null,
});

const recordMigrationItemEvent = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	dryRun,
	item,
	status,
	itemPreview,
	response,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	dryRun: boolean;
	item: RunScopeItem;
	status: MigrationItemEventStatus;
	itemPreview: MigrationItemPreview | null;
	response: MigrationItemEventResponse;
}) => {
	await migrationItemEventRepo.insert({
		ctx,
		event: {
			timestamp: new Date().toISOString(),
			org_id: ctx.org.id,
			env: ctx.env,
			migration_internal_id: migrationInternalId,
			migration_run_id: migrationRunId,
			dry_run: dryRun,
			item_kind: item.kind,
			item_id: item.internal_id,
			item_preview: itemPreview,
			status,
			response,
		},
	});
};

const markItemRunFinished = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	dryRun,
	item,
	status,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	dryRun: boolean;
	item: RunScopeItem;
	status: Exclude<MigrationItemEventStatus, "failed">;
}) => {
	const params = {
		ctx,
		migrationInternalId,
		migrationRunId,
		dryRun,
		itemKind: item.kind,
		itemId: item.internal_id,
	};

	if (status === "skipped") {
		await migrationItemRunRepo.markSkipped(params);
		return;
	}

	await migrationItemRunRepo.markSucceeded(params);
};

const runTrackedItem = async <T extends MigrationItemTrackingResult>({
	ctx,
	migrationInternalId,
	migrationRunId,
	dryRun,
	item,
	run,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	dryRun: boolean;
	item: RunScopeItem;
	run: () => Promise<T>;
}): Promise<T> => {
	try {
		const result = await run();

		await markItemRunFinished({
			ctx,
			migrationInternalId,
			migrationRunId,
			dryRun,
			item,
			status: result.status,
		});

		await recordMigrationItemEvent({
			ctx,
			migrationInternalId,
			migrationRunId,
			dryRun,
			item,
			status: result.status,
			itemPreview: result.itemPreview,
			response: result.response,
		});

		return result;
	} catch (error) {
		await migrationItemRunRepo.markFailed({
			ctx,
			migrationInternalId,
			migrationRunId,
			dryRun,
			itemKind: item.kind,
			itemId: item.internal_id,
		});

		await recordMigrationItemEvent({
			ctx,
			migrationInternalId,
			migrationRunId,
			dryRun,
			item,
			status: "failed",
			itemPreview: itemToPreview(item),
			response: errorToResponse(error),
		});
		throw error;
	}
};

export const withMigrationItemTracking = async <
	T extends MigrationItemTrackingResult,
>({
	ctx,
	migrationInternalId,
	migrationRunId,
	item,
	dryRun,
	claimItemRun = false,
	retryItemStatuses,
	run,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	item: RunScopeItem;
	dryRun: boolean;
	claimItemRun?: boolean;
	retryItemStatuses?: RetryableMigrationItemRunStatus[];
	run: () => Promise<T>;
}): Promise<T | undefined> => {
	if (claimItemRun) {
		const retryStatuses = normalizeRetryItemStatuses({
			retryItemStatuses,
		});
		const claim = await migrationItemRunRepo.claim({
			ctx,
			migrationInternalId,
			migrationRunId,
			dryRun,
			itemKind: item.kind,
			itemId: item.internal_id,
			claimBehavior: retryStatuses.length > 0 ? "retry_statuses" : "claim_new",
			retryStatuses,
		});

		if (!claim.claimed) {
			ctx.logger.info("run-migration: item already claimed", {
				data: {
					kind: item.kind,
					itemId: item.internal_id,
					status: claim.itemRun?.status,
				},
			});
			return undefined;
		}
	}

	return runTrackedItem({
		ctx,
		migrationInternalId,
		migrationRunId,
		dryRun,
		item,
		run,
	});
};
