import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { RunScopeItem, RunScopeKind } from "../run/types/runScope.js";
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
}: {
	ctx: AutumnContext;
	migration: Migration;
	kind: RunScopeKind;
}): Promise<{
	kind: RunScopeKind;
	count: number;
	iterate: () => AsyncGenerator<RunScopeItem[]>;
}> => {
	if (kind !== "customer")
		throw new Error(
			`runFilter: scope kind "${kind}" not supported yet (phase 2+)`,
		);

	const filter = migration.filter?.customer ?? {};
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
