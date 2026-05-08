import type { migrateCustomer } from "../migrateCustomer/index.js";
import type { IterateScopeSummary } from "../orchestrators/iterateScope.js";
import type { RunScopeKind } from "./runScope.js";

/** One scope's portion of a run — kind-tagged for phase-2 multi-scope. */
export type RunMigrationScopeResult = {
	kind: RunScopeKind;
	count: number;
	summary: IterateScopeSummary<Awaited<ReturnType<typeof migrateCustomer>>>;
};

export type RunMigrationResponse = {
	migration_id: string;
	dry_run: boolean;
	prepare_warnings: string[];
	scopes: RunMigrationScopeResult[];
};
