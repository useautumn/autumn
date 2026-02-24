import { type AppEnv, CusProductStatus } from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext.js";
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

		// Group customer products by org and env
		const groupedByOrgEnv = new Map<
			string,
			{ orgId: string; env: AppEnv; customerProductIds: string[] }
		>();

		for (const result of toCleanup) {
			const key = `${result.org.id}:${result.customer.env}`;
			if (!groupedByOrgEnv.has(key)) {
				groupedByOrgEnv.set(key, {
					orgId: result.org.id,
					env: result.customer.env,
					customerProductIds: [],
				});
			}
			groupedByOrgEnv
				.get(key)!
				.customerProductIds.push(result.customer_product.id);
		}

		// Process each org/env group
		for (const [_key, group] of groupedByOrgEnv) {
			const repoContext: RepoContext = {
				db: ctx.db,
				org: {
					id: group.orgId,
				},
				env: group.env,
				logger: logger,
			};
			await batchUpdateCustomerProducts({
				ctx: repoContext,
				updates: group.customerProductIds.map((id) => ({
					id,
					updates: { status: CusProductStatus.Expired },
				})),
			});
		}

		logger.info(`Expired ${toCleanup.length} customer products`);
		console.log(`Expired ${toCleanup.length} customer products`);
	} catch (error) {
		console.error("[One-off Cleanup DRY RUN] Error:", error);
	}
};
