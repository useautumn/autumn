import { customerPrices, customerProducts, customers } from "@autumn/shared";
import { and, eq, gt, isNotNull, notExists, sql } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";

export const runProductCron = async () => {
	console.log("Running product cron");
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
						.where(eq(customerPrices.customer_product_id, customerProducts.id)),
				),
				// trial_ends_at is not null
				isNotNull(customerProducts.trial_ends_at),
				// trial_ends_at > now (comparing epoch timestamps in milliseconds)
				gt(
					customerProducts.trial_ends_at,
					sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`,
				),
			),
		);

	console.log(
		`Found ${results.length} customer products with no prices and active trials`,
	);

	const uniqueOrgIds = [...new Set(results.map((r) => r.customers.org_id))];
	console.log("Unique org IDs:", uniqueOrgIds);

	// for (const result of results) {
	// 	console.log(
	// 		`Customer ${result.customers.id}, Org: ${result.customers.org_id}, product: ${result.customer_products.product_id}`,
	// 	);
	// }
	// const expireCusProduct = async (customerProduct: CustomerProduct) => {
	// 	await CusProductService.update({
	// 		db,
	// 		cusProductId: customerProduct.id,
	// 		updates: {
	// 			status: CusProductStatus.Expired,
	// 		},
	// 	});
	// };

	// const batchSize = 50;
	// for (let i = 0; i < results.length; i += batchSize) {
	// 	const batch = results.slice(i, i + batchSize);
	// 	const batchExpires = batch.map((cusProduct) =>
	// 		expireCusProduct(cusProduct),
	// 	);
	// 	await Promise.all(batchExpires);
	// 	console.log(`Expired batch of ${batch.length} customer products`);
	// }

	return results;
};
