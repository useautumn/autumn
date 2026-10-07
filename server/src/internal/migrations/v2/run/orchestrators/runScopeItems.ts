import { isMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withMigrationItemTracking } from "../../actions/migrationItem/index.js";
import { runCloudScopeIteration } from "../../cloudAdapter/runCloudScopeIteration.js";
import type {
	MigrationBatchFn,
	MigrationRunControls,
} from "../../cloudAdapter/types.js";
import type { MigrationHooks } from "../../hooks/index.js";
import {
	isPersistedMigration,
	type MigrationRuntimeWithEventId,
} from "../../types/migrationDefinition.js";
import { migrateCustomer } from "../migrateCustomer/index.js";
import type { RunScopeItem, RunScopeKind } from "../types/runScope.js";
import { iterateScope } from "./iterateScope.js";

/** Claims and migrates every item `iterate` yields, `controls.concurrency` at a time. */
export const runScopeItems = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	kind,
	iterate,
	batch,
	controls,
	hooks,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	kind: RunScopeKind;
	iterate: () => AsyncGenerator<RunScopeItem[]>;
	batch?: MigrationBatchFn;
	controls?: MigrationRunControls;
	hooks?: MigrationHooks;
}) => {
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
			shouldStop: () => cancelRequested,
		});
	}

	return runCloudScopeIteration({
		batch,
		iterate,
		kind,
		controls,
		perItem,
	});
};
