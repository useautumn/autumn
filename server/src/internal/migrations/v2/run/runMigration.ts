import type { Migration, Operations } from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { runFilter } from "../filters/runFilter.js";
import { recordMigrationCustomerEvent } from "./events/index.js";
import { iterateScope, runPreparation } from "./orchestrators/index.js";
import { runOpsForCustomer } from "./perItem/runOpsForCustomer.js";
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
	migrationRunId,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dry_run: boolean;
	migrationRunId: string;
}): Promise<RunMigrationResponse> => {
	await recordMigrationCustomerEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun: dry_run,
		eventType: "migration_started",
		details: {
			migrationInternalId: migration.internal_id,
		},
	});

	const { response: prepareResponse, prepared_state: preparedState } =
		await runPreparation({
			ctx,
			migration,
			dry_run,
		});

	const scope_id = `mig_${migration.internal_id}`;
	const operations: Operations = migration.operations ?? {};

	const scopeResults: RunMigrationScopeResult[] = [];

	for (const kind of scopesForRun(migration)) {
		const { count, iterate } = await runFilter({ ctx, migration, kind });
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

				const fullCustomer = await CusService.getFull({
					ctx,
					idOrInternalId: item.internal_id,
				});

				await recordMigrationCustomerEvent({
					ctx,
					migration,
					migrationRunId,
					dryRun: dry_run,
					eventType: "customer_started",
					internalCustomerId: fullCustomer.internal_id,
					customerId: fullCustomer.id,
					details: { beforeCustomer: fullCustomer },
				});

				const result = await runOpsForCustomer({
					ctx,
					scopeId: scope_id,
					fullCustomer,
					operations,
					preparedState,
					dryRun: dry_run,
				});

				await recordMigrationCustomerEvent({
					ctx,
					migration,
					migrationRunId,
					dryRun: dry_run,
					eventType:
						result.matched_cusproducts === 0
							? "customer_skipped"
							: "customer_succeeded",
					internalCustomerId: fullCustomer.internal_id,
					customerId: fullCustomer.id,
					details: {
						matchedCustomerProducts: result.matched_cusproducts,
						upsertItems: result.upsert_items,
					},
				});

				return result;
			},
		});

		const failedResults = summary.results.filter(
			(result) => result.status === "failed",
		);
		if (failedResults.length > 0) {
			await recordMigrationCustomerEvent({
				ctx,
				migration,
				migrationRunId,
				dryRun: dry_run,
				eventType: "customers_failed",
				details: {
					kind,
					errors: failedResults.map((result) => ({
						internalCustomerId: result.item.internal_id,
						customerId: result.item.id,
						message: result.error.message,
					})),
				},
			});
		}

		scopeResults.push({ kind, count, summary });
	}

	await recordMigrationCustomerEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun: dry_run,
		eventType: "migration_completed",
		details: {
			scopes: scopeResults.map(({ kind, count, summary }) => ({
				kind,
				count,
				processed: summary.processed,
				succeeded: summary.succeeded,
				failed: summary.failed,
			})),
		},
	});

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
