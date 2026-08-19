import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { prepare } from "@/internal/migrations/v2/prepare/prepare.js";
import { preProcessMigration } from "@/internal/migrations/v2/run/preProcess/preProcessMigration.js";
import { migrateCustomer } from "@/internal/migrations/v2/run/migrateCustomer/migrateCustomer.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

/** Prepare + apply a persisted catalog draft in-process (no Trigger). */
export const runCatalogDraftInline = async ({
	ctx,
	migrationId,
	customerIds,
}: {
	ctx: AutumnContext;
	migrationId: string;
	customerIds: string[];
}) => {
	const [migration] = await migrationRepo.get({ ctx, id: migrationId });
	if (!migration) throw new Error(`Migration ${migrationId} not found`);

	const guarded = preProcessMigration(migration);
	const { preparedState } = await prepare({
		ctx,
		migration: guarded,
		dryRun: false,
	});
	const prepared = { ...guarded, prepared_state: preparedState };

	const results = [];
	for (const customerId of customerIds) {
		results.push(
			await migrateCustomer({ ctx, customerId, migration: prepared }),
		);
	}
	return results;
};
