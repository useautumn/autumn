import type { RunMigrationScopeResult } from "../types/runMigrationResponse.js";
import type { RunScopeKind } from "../types/runScope.js";

export type MigrationScopeEventSummary = {
	kind: RunScopeKind;
	count: number;
	processed: number;
	succeeded: number;
	failed: number;
};

/** Summarizes scope results for migration terminal events. */
export const getScopeEventSummaries = ({
	scopeResults,
}: {
	scopeResults: RunMigrationScopeResult[];
}): MigrationScopeEventSummary[] =>
	scopeResults.map(({ kind, count, summary }) => ({
		kind,
		count,
		processed: summary.processed,
		succeeded: summary.succeeded,
		failed: summary.failed,
	}));
