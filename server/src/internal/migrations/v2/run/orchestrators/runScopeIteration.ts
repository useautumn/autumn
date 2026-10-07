import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	MigrationBatchFn,
	MigrationRunControls,
} from "../../cloudAdapter/types.js";
import { runFilter } from "../../filters/runFilter.js";
import type { MigrationHooks } from "../../hooks/index.js";
import type { MigrationRuntimeWithEventId } from "../../types/migrationDefinition.js";
import type { RunScopeKind } from "../types/runScope.js";
import { runScopeItems } from "./runScopeItems.js";

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
	includeFilterCount,
	afterInternalId,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	kind: RunScopeKind;
	batch?: MigrationBatchFn;
	controls?: MigrationRunControls;
	hooks?: MigrationHooks;
	includeFilterCount?: boolean;
	afterInternalId?: string;
}) => {
	const { count, iterate } = await runFilter({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		kind,
		controls,
		includeCount: includeFilterCount,
		afterInternalId,
	});
	ctx.logger.info(`run-migration: iterating scope`, {
		data: { kind, count, dryRun },
	});
	return runScopeItems({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		kind,
		iterate,
		batch,
		controls,
		hooks,
	});
};
