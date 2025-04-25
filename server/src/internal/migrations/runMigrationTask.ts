import { MigrationService } from "./MigrationService.js";
import { ProductService } from "../products/ProductService.js";

import { getMigrationCustomers } from "./migrationSteps/getMigrationCustomers.js";
import { migrateCustomers } from "./migrationSteps/migrateCustomers.js";
import { MigrationJobStep } from "@autumn/shared";

export const runMigrationTask = async ({
  payload,
  logger,
  sb,
}: {
  payload: any;
  logger: any;
  sb: any;
}) => {
  const { migrationJobId } = payload;

  try {
    logger.info(`Running migration task, ID: ${migrationJobId}`);

    const migrationJob = await MigrationService.getJob({
      sb,
      id: migrationJobId,
    });

    let { org_id: orgId, env } = migrationJob;

    // Get from and to products
    let [fromProduct, toProduct] = await Promise.all([
      ProductService.getFullProduct({
        sb,
        internalId: migrationJob.from_internal_product_id,
        orgId,
        env,
      }),
      ProductService.getFullProduct({
        sb,
        internalId: migrationJob.to_internal_product_id,
        orgId,
        env,
      }),
    ]);

    // STEP 1: GET ALL CUSTOMERS AND INSERT INTO MIGRATIONS...
    let customers = await getMigrationCustomers({
      sb,
      migrationJobId,
      fromProduct,
      logger,
    });

    logger.info(`Job ${migrationJobId} | Found ${customers?.length} customers`);

    // STEP 2: MIGRATE CUSTOMERS..
    await migrateCustomers({
      sb,
      migrationJob,
      fromProduct,
      toProduct,
      customers,
      logger,
    });

    // await new Promise((resolve) => setTimeout(resolve, 10000));
  } catch (error) {
    logger.error(`Migration failed: ${migrationJobId}`);
    logger.error(error);
    await MigrationService.updateJob({
      sb,
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
