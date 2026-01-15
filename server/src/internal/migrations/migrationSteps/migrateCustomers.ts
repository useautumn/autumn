import dotenv from "dotenv";

dotenv.config();

import {
	type Customer,
	type FullProduct,
	type MigrationJob,
	MigrationJobStep,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { MigrationService } from "../MigrationService.js";
import { migrateCustomer } from "./migrateCustomer.js";

export const migrateCustomers = async ({
	ctx,
	migrationJob,
	fromProduct,
	toProduct,
	customers,
}: {
	ctx: AutumnContext;
	migrationJob: MigrationJob;
	fromProduct: FullProduct;
	toProduct: FullProduct;
	customers: Customer[];
}) => {
	const { db, logger, org } = ctx;
	const { env } = migrationJob;

	await MigrationService.updateJob({
		db,
		migrationJobId: migrationJob.id,
		updates: {
			current_step: MigrationJobStep.MigrateCustomers,
		},
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
					ctx,
					customerId: customer.id,
					fromProduct,
					toProduct,
					migrationJob,
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
	}

	// Get number of errors
	const migrationDetails = {};

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
};
