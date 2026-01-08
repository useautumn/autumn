import { type AppEnv, MigrationJobStep } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "../products/ProductService.js";
import { MigrationService } from "./MigrationService.js";
import { getMigrationCustomers } from "./migrationSteps/getMigrationCustomers.js";
import { migrateCustomers } from "./migrationSteps/migrateCustomers.js";

export interface MigrationTaskPayload {
	migrationJobId: string;
	orgId: string;
	env: AppEnv;
}

export const runMigrationTask = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: MigrationTaskPayload;
}) => {
	const { db, logger } = ctx;
	const { migrationJobId } = payload;

	try {
		const migrationJob = await MigrationService.getJob({
			db,
			id: migrationJobId,
		});

		if (migrationJob.current_step !== MigrationJobStep.Queued) {
			logger.info(
				`Migration job ${migrationJobId} already in progress or completed (status: ${migrationJob.current_step}). Skipping.`,
			);
			return;
		}

		await MigrationService.updateJob({
			db,
			migrationJobId,
			updates: {
				current_step: MigrationJobStep.Received,
			},
		});

		const { org_id: orgId, env } = migrationJob;

		// Get from and to products
		const [fromProduct, toProduct] = await Promise.all([
			ProductService.getFull({
				db,
				idOrInternalId: migrationJob.from_internal_product_id,
				orgId,
				env,
			}),
			ProductService.getFull({
				db,
				idOrInternalId: migrationJob.to_internal_product_id,
				orgId,
				env,
			}),
		]);

		// STEP 1: GET ALL CUSTOMERS AND INSERT INTO MIGRATIONS...
		const customers = await getMigrationCustomers({
			db,
			migrationJobId,
			fromProduct,
		});

		logger.info(
			`Running migration for org ${ctx.org.id}, from ${fromProduct.name} to ${toProduct.name}`,
		);

		// STEP 2: MIGRATE CUSTOMERS..
		await migrateCustomers({
			ctx,
			migrationJob,
			fromProduct,
			toProduct,
			customers,
		});
	} catch (error) {
		logger.error(`Migration failed: ${migrationJobId}`);
		logger.error(error);
		await MigrationService.updateJob({
			db,
			migrationJobId,
			updates: {
				current_step: MigrationJobStep.Failed,
				step_details: {
					error: error,
				},
			},
		});
		throw error;
	}
};
