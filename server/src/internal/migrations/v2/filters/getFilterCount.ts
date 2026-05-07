import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunScopeKind } from "../run/types/runScope.js";
import { countCustomers } from "./customers/filterCustomers.js";

/** Migration-fed shim. Delegates to per-kind pure counters. */
export const getFilterCount = async ({
	ctx,
	migration,
	kind,
}: {
	ctx: AutumnContext;
	migration: Migration;
	kind: RunScopeKind;
}): Promise<number> => {
	if (kind !== "customer")
		throw new Error(
			`getFilterCount: scope kind "${kind}" not supported yet (phase 2+)`,
		);
	return countCustomers({
		ctx,
		filter: migration.filter?.customer ?? {},
	});
};
