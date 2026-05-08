import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { runFilter } from "../filters/runFilter.js";
import { migrateCustomer } from "./migrateCustomer/index.js";
import { iterateScope, runPreparation } from "./orchestrators/index.js";
import type {
	RunMigrationResponse,
	RunMigrationScopeResult,
} from "./types/runMigrationResponse.js";
import type { RunScopeKind } from "./types/runScope.js";

/** Top-level migration run: prepare → per-scope filter+iterate → per-item ops. */
export const runMigration = async ({
	ctx,
	migration,
	dry_run,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dry_run: boolean;
}): Promise<RunMigrationResponse> => {
	const { response: prepareResponse, prepared_state } = await runPreparation({
		ctx,
		migration,
		dry_run,
	});
	const preparedMigration = { ...migration, prepared_state };

	const scopeResults: RunMigrationScopeResult[] = [];

	for (const kind of scopesForRun(preparedMigration)) {
		const { count, iterate } = await runFilter({
			ctx,
			migration: preparedMigration,
			kind,
		});
		ctx.logger.info(`run-migration: iterating scope`, {
			data: { kind, count, dry_run },
		});

		const summary = await iterateScope({
			iterate,
			perItem: async (item) => {
				if (item.kind !== "customer")
					throw new Error(
						`runMigration: per-item handler missing for kind "${item.kind}"`,
					);
				return migrateCustomer({
					ctx,
					customerId: item.internal_id,
					migration: preparedMigration,
					preview: dry_run,
				});
			},
		});

		scopeResults.push({ kind, count, summary });
	}

	return {
		migration_id: migration.id,
		dry_run,
		prepare_warnings: prepareResponse.warnings,
		scopes: scopeResults,
	};
};

/** Active scopes = top-level keys present in `migration.operations`. */
const scopesForRun = (migration: Migration): RunScopeKind[] => {
	const scopes: RunScopeKind[] = [];
	if (migration.operations?.customer) scopes.push("customer");
	// future: if (migration.operations?.plan) scopes.push("plan");
	return scopes;
};
