import type { Migration } from "@autumn/shared";
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
	migration,
	item,
	status,
}: {
	ctx: AutumnContext;
	migration: Migration;
	item: RunScopeItem;
	status: Exclude<MigrationItemEventStatus, "failed">;
}) => {
	const params = {
		ctx,
		migrationInternalId: migration.internal_id,
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
	migration,
	migrationInternalId,
	migrationRunId,
	dryRun,
	item,
	trackItemRun,
	run,
}: {
	ctx: AutumnContext;
	migration?: Migration;
	migrationInternalId: string;
	migrationRunId: string;
	dryRun: boolean;
	item: RunScopeItem;
	trackItemRun: boolean;
	run: () => Promise<T>;
}): Promise<T> => {
	try {
		const result = await run();

		if (trackItemRun && migration && !dryRun) {
			await markItemRunFinished({
				ctx,
				migration,
				item,
				status: result.status,
			});
		}

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
		if (trackItemRun && migration && !dryRun) {
			await migrationItemRunRepo.markFailed({
				ctx,
				migrationInternalId: migration.internal_id,
				itemKind: item.kind,
				itemId: item.internal_id,
			});
		}

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
	migration,
	migrationRunId,
	item,
	dryRun,
	run,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	item: RunScopeItem;
	dryRun: boolean;
	run: () => Promise<T>;
}): Promise<T | undefined> => {
	if (dryRun) {
		return runTrackedItem({
			ctx,
			migration,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			dryRun,
			item,
			trackItemRun: true,
			run,
		});
	}

	const claim = await migrationItemRunRepo.claim({
		ctx,
		migrationInternalId: migration.internal_id,
		itemKind: item.kind,
		itemId: item.internal_id,
		claimBehavior: migration.retry_failed ? "retry_failed" : "claim_new",
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

	return runTrackedItem({
		ctx,
		migration,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		dryRun,
		item,
		trackItemRun: true,
		run,
	});
};

export const withMigrationItemEvents = async <
	T extends MigrationItemTrackingResult,
>({
	ctx,
	migrationInternalId,
	migrationRunId,
	item,
	dryRun,
	run,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	item: RunScopeItem;
	dryRun: boolean;
	run: () => Promise<T>;
}): Promise<T> => {
	return runTrackedItem({
		ctx,
		migrationInternalId,
		migrationRunId,
		dryRun,
		item,
		trackItemRun: false,
		run,
	});
};
