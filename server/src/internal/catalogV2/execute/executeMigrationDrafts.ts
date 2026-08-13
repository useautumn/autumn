import type { CatalogMigration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

/** Persist computed drafts after product writes. */
export const executeMigrationDrafts = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<CatalogMigration[]> => {
	for (const migration of updateCatalogPlan.migrationDrafts) {
		await migrationRepo.insert({
			ctx,
			insert: {
				id: migration.id,
				filter: migration.filter,
				operations: migration.operations,
				no_billing_changes: migration.no_billing_changes,
			},
		});
	}
	return updateCatalogPlan.migrationDrafts;
};
