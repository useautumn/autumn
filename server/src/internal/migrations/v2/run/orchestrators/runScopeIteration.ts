import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	withMigrationItemEvents,
	withMigrationItemTracking,
} from "../../actions/migrationItem/index.js";
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
import type { RunScopeItem, RunScopeKind } from "../types/runScope.js";
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
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	kind: RunScopeKind;
	batch?: MigrationBatchFn;
	controls?: MigrationRunControls;
	hooks?: MigrationHooks;
}) => {
	const { count, iterate } = await runFilter({
		ctx,
		migration,
		kind,
		controls,
	});
	ctx.logger.info(`run-migration: iterating scope`, {
		data: { kind, count, dryRun },
	});

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

		const run = () =>
			migrateCustomer({
				ctx: itemCtx,
				customerId: item.id ?? item.internal_id,
				migration,
				preview: dryRun,
				hooks,
			});

		if (!isPersistedMigration(migration)) {
			return withMigrationItemEvents({
				ctx: itemCtx,
				migrationInternalId: migration.event_internal_id,
				migrationRunId,
				item,
				dryRun,
				run,
			});
		}

		return withMigrationItemTracking({
			ctx: itemCtx,
			migration,
			migrationRunId,
			item,
			dryRun,
			run,
		});
	};

	if (!batch) {
		return iterateScope({
			iterate,
			perItem: (item) => perItem({ item, itemCtx: ctx }),
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
