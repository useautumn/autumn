import {
	ACTIVE_STATUSES,
	CusProductStatus,
	customerPrices,
	customerProducts,
	customers,
	notNullish,
} from "@autumn/shared";
import { and, eq, inArray, isNotNull, lt, notExists, sql } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { batchDeleteCachedCustomers } from "../../internal/customers/cusUtils/apiCusCacheUtils/batchDeleteCachedCustomers";

export const runProductCron = async () => {
	console.log("Running product cron");
	try {
		// Get customer_products that have 0 customer_prices, and trial_ends_at is not null, and trial_ends_at > now
		const results = await db
			.select()
			.from(customerProducts)
			.innerJoin(
				customers,
				eq(customerProducts.internal_customer_id, customers.internal_id),
			)
			.where(
				and(
					// No customer_prices exist for this customer_product
					notExists(
						db
							.select()
							.from(customerPrices)
							.where(
								eq(customerPrices.customer_product_id, customerProducts.id),
							),
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

		const expireCusProducts = async (ids: string[]) => {
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
			await expireCusProducts(batch.map((r) => r.customer_products.id));
			console.log(
				`Expired batch of ${i + batch.length}/${results.length} customer products`,
			);

			await batchDeleteCachedCustomers({
				customers: batch
					.filter((r) => notNullish(r.customers.id))
					.map((r) => ({
						orgId: r.customers.org_id,
						env: r.customers.env,
						customerId: r.customers.id!,
					})),
			});
		}
		return results;
	} catch (error) {
		console.log("Error running product cron:", error);
	}
};
