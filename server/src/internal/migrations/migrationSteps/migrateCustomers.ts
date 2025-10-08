import dotenv from "dotenv";

dotenv.config();

import {
	type Customer,
	type Feature,
	type FullProduct,
	type MigrationJob,
	MigrationJobStep,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { MigrationService } from "../MigrationService.js";
import { migrateCustomer } from "./migrateCustomer.js";

export const migrateCustomers = async ({
	db,
	migrationJob,
	fromProduct,
	toProduct,
	logger,
	customers,
	features,
}: {
	db: DrizzleCli;
	migrationJob: MigrationJob;
	fromProduct: FullProduct;
	toProduct: FullProduct;
	logger: any;
	customers: Customer[];
	features: Feature[];
}) => {
	await MigrationService.updateJob({
		db,
		migrationJobId: migrationJob.id,
		updates: {
			current_step: MigrationJobStep.MigrateCustomers,
		},
	});

	let batchCount = 0;
	const { org_id: orgId, env } = migrationJob;

	const org = await OrgService.get({
		db,
		orgId,
	});

	// Create stripe prices if they don't exist
	const stripeCli = createStripeCli({ org, env });
	const batchCreate = [];
	for (const price of toProduct.prices) {
		batchCreate.push(
			createStripePriceIFNotExist({
				db,
				stripeCli,
				price,
				entitlements: toProduct.entitlements,
				product: toProduct,
				org,
				logger,
			}),
		);
	}

	await Promise.all(batchCreate);

	const batchSize = 5;

	for (let i = 0; i < customers.length; i += batchSize) {
		const batchCustomers = customers.slice(i, i + batchSize);
		const batchPromises = [];
		for (const customer of batchCustomers) {
			if (!customer.id) continue;
			batchPromises.push(
				migrateCustomer({
					db,
					migrationJob,
					customerId: customer.id!,
					org,
					logger,
					env,
					orgId,
					fromProduct,
					toProduct,
					features,
				}),
			);
		}

		const results = await Promise.all(batchPromises);
		const numPassed = results.filter((r) => r).length;
		const numFailed = results.filter((r) => !r).length;
		logger.info(
			`Job: ${migrationJob.id} - Migrated ${i + batchCustomers.length}/${
				customers.length
			}  customers, ${numPassed} passed, ${numFailed} failed`,
		);

		// Get current number of customers migrated
		const curMigrationJob = await MigrationService.getJob({
			db,
			id: migrationJob.id,
		});
		const curSucceeded =
			curMigrationJob.step_details[MigrationJobStep.MigrateCustomers]
				?.succeeded || 0;
		const curFailed =
			curMigrationJob.step_details[MigrationJobStep.MigrateCustomers]?.failed ||
			0;

		await MigrationService.updateJob({
			db,
			migrationJobId: migrationJob.id,
			updates: {
				step_details: {
					...curMigrationJob.step_details,
					[MigrationJobStep.MigrateCustomers]: {
						...(curMigrationJob.step_details[
							MigrationJobStep.MigrateCustomers
						] || {}),

						succeeded: curSucceeded + numPassed,

						failed: curFailed + numFailed,
					},
				},
			},
		});

		batchCount++;
	}

	// Get number of errors
	const migrationDetails: any = {};
	// try {
	//   let errors = await MigrationService.getErrors({
	//     db,
	//     migrationJobId: migrationJob.id,
	//   });

	//   migrationDetails.num_errors = errors!.length;
	//   migrationDetails.failed_customers = errors!.map(
	//     (e: any) => `${e.customer.id} - ${e.customer.name}`,
	//   );
	// } catch (error) {
	//   migrationDetails.failed_to_get_errors = true;
	//   migrationDetails.error = error;
	//   logger.error("Failed to get migration errors");
	//   logger.error(error);
	// }

	const curMigrationJob = await MigrationService.getJob({
		db,
		id: migrationJob.id,
	});

	await MigrationService.updateJob({
		db,
		migrationJobId: migrationJob.id,
		updates: {
			current_step: MigrationJobStep.Finished,
			step_details: {
				...curMigrationJob.step_details,
				[MigrationJobStep.MigrateCustomers]: migrationDetails,
			},
		},
	});

	// await sendMigrationEmail({
	//   db,
	//   migrationJobId: migrationJob.id,
	//   org,
	// });
};
