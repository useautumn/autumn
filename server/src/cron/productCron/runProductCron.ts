import {
	ACTIVE_STATUSES,
	CusProductStatus,
	customerPrices,
	customerProducts,
} from "@autumn/shared";
import { and, eq, inArray, isNotNull, lt, notExists, sql } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";

export const runProductCron = async () => {
	console.log("Running product cron");
	// Get customer_products that have 0 customer_prices, and trial_ends_at is not null, and trial_ends_at > now
	const results = await db
		.select()
		.from(customerProducts)

		.where(
			and(
				// No customer_prices exist for this customer_product
				notExists(
					db
						.select()
						.from(customerPrices)
						.where(eq(customerPrices.customer_product_id, customerProducts.id)),
				),
				// status is not expired
				inArray(customerProducts.status, ACTIVE_STATUSES),

				// trial_ends_at is not null
				isNotNull(customerProducts.trial_ends_at),

				// is already expired
				lt(
					customerProducts.trial_ends_at,
					sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`,
				),
			),
		);

	console.log(
		`Found ${results.length} customer products with no prices and active trials`,
	);

	// fs.writeFileSync(
	// 	`${process.cwd()}/scripts/expired_free_trials.json`,
	// 	JSON.stringify(results, null, 2),
	// );
	// return;

	// for (const result of results) {
	// 	console.log(
	// 		`Customer ${result.customers.id} product: ${result.customer_products.product_id}`,
	// 	);
	// }

	// const uniqueOrgIds = [...new Set(results.map((r) => r.customers.org_id))];
	// console.log("Unique org IDs:", uniqueOrgIds);

	// for (const result of results) {
	// 	console.log(
	// 		`Customer ${result.customers.id} product: ${result.customer_products.product_id}`,
	// 	);
	// }
	const expireCusProducts = async (ids: string[]) => {
		// console.log("Expiring:", ids);
		// Save the ids to scripts/json
		await db
			.update(customerProducts)
			.set({
				status: CusProductStatus.Expired,
			})
			.where(inArray(customerProducts.id, ids));
	};

	const batchSize = 250;
	for (let i = 0; i < results.length; i += batchSize) {
		const batch = results.slice(i, i + batchSize);
		await expireCusProducts(batch.map((r) => r.id));
		console.log(
			`Expired batch of ${i + batch.length}/${results.length} customer products`,
		);
	}

	return results;
};
