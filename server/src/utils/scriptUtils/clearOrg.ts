import {
	AppEnv,
	customers,
	features,
	type Organization,
	products,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const clearCustomersInBatches = async ({
	db,
	org,
	batchSize = 450,
}: {
	db: DrizzleCli;
	org: Organization;
	batchSize?: number;
}) => {
	let deletedCount = 0;

	while (true) {
		// Get a batch of customer IDs to delete
		const customerBatch = await db
			.select({ internalId: customers.internal_id })
			.from(customers)
			.where(
				and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Sandbox)),
			)
			.limit(batchSize);

		if (customerBatch.length === 0) {
			break; // No more customers to delete
		}

		// Delete the batch
		const customerIds = customerBatch
			.map((c) => c.internalId)
			.filter((id) => id !== null);

		console.log("Deleting customers:", customerIds);

		await db
			.delete(customers)
			.where(inArray(customers.internal_id, customerIds));

		deletedCount += customerBatch.length;
		console.log(
			`Deleted ${customerBatch.length} customers (total: ${deletedCount})`,
		);
	}

	return deletedCount;
};

export const clearOrg = async ({
	db,
	org,
}: {
	db: DrizzleCli;
	org: Organization;
}) => {
	const deletedCount = await clearCustomersInBatches({ db, org });
	console.log(`Cleared ${deletedCount} customers`);

	await db
		.delete(products)
		.where(and(eq(products.org_id, org.id), eq(products.env, AppEnv.Sandbox)));

	console.log("Cleared products");

	await db
		.delete(features)
		.where(and(eq(features.org_id, org.id), eq(features.env, AppEnv.Sandbox)));

	console.log("Cleared features");
};
