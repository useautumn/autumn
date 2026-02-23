import { CusProductStatus } from "@autumn/shared";
import { getOneOffCustomerProductsToCleanup } from "@/internal/customers/cusProducts/actions/cleanupOneOff/getOneOffToCleanup.js";
import { batchUpdateCustomerProducts } from "@/internal/customers/cusProducts/repos/batchUpdateCustomerProducts.js";
import type { CronContext } from "../utils/CronContext.js";

/** Dry-run: fetches one-off customer products eligible for cleanup and logs them without making any updates. */
export const runOneOffCleanup = async ({ ctx }: { ctx: CronContext }) => {
	const { logger } = ctx;
	try {
		const toCleanup = await getOneOffCustomerProductsToCleanup({
			ctx,
		});

		console.log(`Found ${toCleanup.length} customer products to cleanup`);
		logger.info(`Found ${toCleanup.length} customer products to cleanup`);

		// Log the results
		for (const result of toCleanup) {
			logger.info(
				`[One-off Cleanup] expiring customer product: ${result.customer_product.id} (${result.org.slug})`,
				{
					context: {
						org_id: result.org.id,
						org_slug: result.org.slug,
						customer_id: result.customer.id,
						env: result.customer.env,
					},
					data: {
						customerProductId: result.customer_product.id,
						productId: result.product.id,
					},
				},
			);
		}

		await batchUpdateCustomerProducts({
			db: ctx.db,
			updates: toCleanup.map((result) => ({
				id: result.customer_product.id,
				updates: { status: CusProductStatus.Expired },
			})),
		});

		logger.info(`Expired ${toCleanup.length} customer products`);
		console.log(`Expired ${toCleanup.length} customer products`);
	} catch (error) {
		console.error("[One-off Cleanup DRY RUN] Error:", error);
	}
};
