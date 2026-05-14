import { MigrationItemRunStatus } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { MigrationRunControls } from "../cloudAdapter/types.js";
import type { RunScopeItem, RunScopeKind } from "../run/types/runScope.js";
import type {
	MigrationRuntime,
	MigrationRuntimeWithEventId,
} from "../types/migrationDefinition.js";
import type { CustomerCheckpointExclusion } from "./customers/buildCustomerSelect.js";
import {
	countCustomers,
	filterCustomers,
} from "./customers/filterCustomers.js";

/**
 * Migration-fed shim. Dispatches by scope kind, unwraps the relevant
 * filter from `migration.filter`, and delegates to the pure inner fns
 * (`countCustomers` / `filterCustomers`). Empty filter ⇒ whole org+env.
 */
export const runFilter = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	kind,
	controls,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	kind: RunScopeKind;
	controls?: MigrationRunControls;
}): Promise<{
	kind: RunScopeKind;
	count: number;
	iterate: () => AsyncGenerator<RunScopeItem[]>;
}> => {
	if (kind !== "customer")
		throw new Error(
			`runFilter: scope kind "${kind}" not supported yet (phase 2+)`,
		);

	const filter = narrowCustomerFilter({
		filter: migration.filter?.customer ?? {},
		controls,
	});
	const checkpoint = getCustomerCheckpointExclusion({
		migration,
		migrationRunId,
		dryRun,
		controls,
	});
	const count = await countCustomers({ ctx, filter, checkpoint });

	const iterate = async function* () {
		for await (const batch of filterCustomers({ ctx, filter, checkpoint })) {
			yield batch.map(
				(row): RunScopeItem => ({
					kind: "customer",
					internal_id: row.internal_id,
					id: row.id,
				}),
			);
		}
	};

	return { kind, count, iterate };
};

const getCustomerCheckpointExclusion = ({
	migration,
	migrationRunId,
	dryRun,
	controls,
}: {
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	controls?: MigrationRunControls;
}): CustomerCheckpointExclusion | undefined => {
	const enabled =
		controls?.checkpoint !== false &&
		(!dryRun || controls?.checkpointDryRun === true);
	if (!enabled) return undefined;

	const excludedStatuses = [
		MigrationItemRunStatus.Running,
		MigrationItemRunStatus.Succeeded,
		MigrationItemRunStatus.Skipped,
		...(migration.retry_failed ? [] : [MigrationItemRunStatus.Failed]),
	];

	return {
		migrationInternalId: migration.event_internal_id,
		migrationRunId,
		dryRun,
		excludedStatuses,
	};
};

const narrowCustomerFilter = ({
	filter,
	controls,
}: {
	filter: NonNullable<MigrationRuntime["filter"]>["customer"];
	controls?: MigrationRunControls;
}) => {
	const only = controls?.only;
	if (!only) return filter ?? {};
	return {
		...(filter ?? {}),
		customer_id: { $in: only },
	};
};
