import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { MigrationRunControls } from "../cloudAdapter/types.js";
import type { RunScopeItem, RunScopeKind } from "../run/types/runScope.js";
import type { MigrationRuntime } from "../types/migrationDefinition.js";
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
	kind,
	controls,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
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
	const count = await countCustomers({ ctx, filter });

	const iterate = async function* () {
		for await (const batch of filterCustomers({ ctx, filter })) {
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

const narrowCustomerFilter = ({
	filter,
	controls,
}: {
	filter: NonNullable<MigrationRuntime["filter"]>["customer"];
	controls?: MigrationRunControls;
}) => {
	const only = controls?.only;
	if (!only) return filter ?? {};
	if (filter?.customer_id !== undefined)
		throw new Error(
			"runMigration: controls.only cannot be combined with filter.customer.customer_id",
		);
	return {
		...(filter ?? {}),
		customer_id: { $in: only },
	};
};
