import {
	MigrationItemRunStatus,
	type MigrationItemRunStatus as MigrationItemRunStatusType,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { MigrationRunControls } from "../cloudAdapter/types.js";
import type { RunScopeItem, RunScopeKind } from "../run/types/runScope.js";
import { normalizeRetryItemStatuses } from "../run/utils/retryItemStatuses.js";
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
	includeCount = true,
	afterInternalId,
	batchSize,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	kind: RunScopeKind;
	controls?: MigrationRunControls;
	includeCount?: boolean;
	afterInternalId?: string;
	batchSize?: number;
}): Promise<{
	kind: RunScopeKind;
	count: number | null;
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
	const limit = controls?.limit ?? undefined;
	const count = includeCount
		? await countCustomers({
				ctx,
				filter,
				checkpoint,
				limit,
			})
		: null;

	ctx.logger.info("runFilter: customer scope resolved", {
		data: {
			migrationRunId,
			matchedCount: count,
			only: controls?.only,
			retryItemStatuses: controls?.retryItemStatuses,
			effectiveFilter: filter,
			checkpointExcludedStatuses: checkpoint?.excludedStatuses,
		},
	});
	if (count === 0) {
		ctx.logger.warn(
			"runFilter: no customers matched — nothing to migrate. " +
				"Common causes: customer is excluded by a previous item_run " +
				"(set retry_item_statuses to re-run checkpointed items), or the customer " +
				"does not match other filter clauses (plan, addon, etc.)",
			{
				data: {
					migrationRunId,
					only: controls?.only,
				},
			},
		);
	}

	const iterate = async function* () {
		for await (const batch of filterCustomers({
			ctx,
			filter,
			checkpoint,
			limit,
			afterInternalId,
			batchSize,
		})) {
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

	const retryItemStatuses = normalizeRetryItemStatuses({
		retryItemStatuses: controls?.retryItemStatuses,
	});
	const retryItemStatusSet = new Set(retryItemStatuses);
	const excludedStatuses: MigrationItemRunStatusType[] = [
		MigrationItemRunStatus.Running,
		MigrationItemRunStatus.Succeeded,
		...(retryItemStatusSet.has(MigrationItemRunStatus.Skipped)
			? []
			: [MigrationItemRunStatus.Skipped]),
		...(retryItemStatusSet.has(MigrationItemRunStatus.Failed)
			? []
			: [MigrationItemRunStatus.Failed]),
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
