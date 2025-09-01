import { MigrationJobStep } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { FeatureService } from "../features/FeatureService.js";
import { ProductService } from "../products/ProductService.js";
import { MigrationService } from "./MigrationService.js";
import { getMigrationCustomers } from "./migrationSteps/getMigrationCustomers.js";
import { migrateCustomers } from "./migrationSteps/migrateCustomers.js";

export const runMigrationTask = async ({
	db,
	payload,
	logger,
}: {
	db: DrizzleCli;
	payload: any;
	logger: any;
}) => {
	const { migrationJobId } = payload;

	try {
		logger.info(`Running migration task, ID: ${migrationJobId}`);

		const migrationJob = await MigrationService.getJob({
			db,
			id: migrationJobId,
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
			logger,
		});

		const features = await FeatureService.list({
			db,
			orgId,
			env,
		});

		logger.info(`Job ${migrationJobId} | Found ${customers?.length} customers`);

		// STEP 2: MIGRATE CUSTOMERS..
		await migrateCustomers({
			db,
			migrationJob,
			fromProduct,
			toProduct,
			customers,
			logger,
			features,
		});

		// await new Promise((resolve) => setTimeout(resolve, 10000));
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
