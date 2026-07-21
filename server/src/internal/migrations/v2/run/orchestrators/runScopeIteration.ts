import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withMigrationItemTracking } from "../../actions/migrationItem/index.js";
import { runCloudScopeIteration } from "../../cloudAdapter/runCloudScopeIteration.js";
import type {
	MigrationBatchFn,
	MigrationRunControls,
} from "../../cloudAdapter/types.js";
import { runFilter } from "../../filters/runFilter.js";
import type { MigrationHooks } from "../../hooks/index.js";
import {
	isPersistedMigration,
	type MigrationRuntimeWithEventId,
} from "../../types/migrationDefinition.js";
import { migrateCustomer } from "../migrateCustomer/index.js";
import type { MigrationRunScheduler } from "../types/migrationRunScheduler.js";
import type { RunScopeItem, RunScopeKind } from "../types/runScope.js";
import { isMigrationCancelRequested } from "../utils/migrationCancelToken.js";
import { iterateScope } from "./iterateScope.js";

/** Runs one filtered migration scope iteration. */
export const runScopeIteration = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	kind,
	batch,
	controls,
	hooks,
	scheduler,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	kind: RunScopeKind;
	batch?: MigrationBatchFn;
	controls?: MigrationRunControls;
	hooks?: MigrationHooks;
	scheduler?: MigrationRunScheduler;
}) => {
	const { count, iterate } = await runFilter({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		kind,
		controls,
	});
	ctx.logger.info(`run-migration: iterating scope`, {
		data: { kind, count, dryRun },
	});
	const checkpointReadEnabled =
		controls?.checkpoint !== false &&
		(!dryRun || controls?.checkpointDryRun === true);

	// In-memory latch so we hit Redis only until the first cancel detection;
	// every later item short-circuits without a cache roundtrip.
	let cancelRequested = false;

	const perItem = async ({
		item,
		itemCtx,
	}: {
		item: RunScopeItem;
		itemCtx: AutumnContext;
	}) => {
		if (item.kind !== "customer")
			throw new Error(
				`runMigration: per-item handler missing for kind "${item.kind}"`,
			);

		if (
			!cancelRequested &&
			(await isMigrationCancelRequested({ migrationRunId }))
		)
			cancelRequested = true;
		if (cancelRequested) {
			itemCtx.logger.info("run-migration: skipping item, cancel requested", {
				data: {
					migrationRunId,
					customerId: item.id ?? item.internal_id,
					internalId: item.internal_id,
				},
			});
			return undefined;
		}

		itemCtx.logger.info("run-migration: processing customer", {
			data: {
				migrationRunId,
				customerId: item.id ?? item.internal_id,
				internalId: item.internal_id,
				dryRun,
			},
		});

		const run = () =>
			migrateCustomer({
				ctx: itemCtx,
				customerId: item.id ?? item.internal_id,
				migration,
				preview: dryRun,
				hooks,
			});

		return withMigrationItemTracking({
			ctx: itemCtx,
			migrationInternalId: isPersistedMigration(migration)
				? migration.internal_id
				: migration.event_internal_id,
			migrationRunId,
			item,
			dryRun,
			claimItemRun: checkpointReadEnabled,
			retryItemStatuses: controls?.retryItemStatuses,
			run,
		});
	};

	if (!batch) {
		return iterateScope({
			iterate,
			perItem: (item) => perItem({ item, itemCtx: ctx }),
			concurrency: controls?.concurrency,
			scheduler,
		});
	}

	return runCloudScopeIteration({
		batch,
		iterate,
		kind,
		controls: scheduler ? { ...controls, concurrency: 1 } : controls,
		perItem,
	});
};
