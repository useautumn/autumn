import {
	type AppEnv,
	CusProductStatus,
	ms,
	orgToFeaturesByOrgEnv,
} from "@autumn/shared";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { ProductService } from "@/internal/products/ProductService";
import type { CronContext } from "../utils/CronContext";
import {
	fetchExpiredTrialProducts,
	groupByOrgEnv,
} from "./fetchExpiredTrialProducts";
import { processExpiredTrialRow } from "./processExpiredTrialRow";

export const runProductCron = async ({
	ctx: cronContext,
}: {
	ctx: CronContext;
}) => {
	console.log("Running product cron");

	const { db } = cronContext;
	const maxIterations = 10;
	const timeoutMs = ms.minutes(1);
	const startTime = Date.now();
	const batchSize = 1000;
	let totalExpired = 0;

	try {
		let iteration = 0;

		while (iteration < maxIterations && Date.now() - startTime < timeoutMs) {
			iteration++;

			const results = await fetchExpiredTrialProducts({ batchSize, db });

			if (results.length === 0) break;

			console.log(
				`Product cron iteration ${iteration}: processing ${results.length} expired trials`,
			);

			const resultsByOrgEnv = await groupByOrgEnv({ results, cronContext });

			for (const { ctx, org, features, rows } of resultsByOrgEnv) {
				const defaultProducts = await ProductService.listDefault({
					db: ctx.db,
					orgId: ctx.org.id,
					env: ctx.env,
					onlyFree: true,
				});

				if (defaultProducts.length === 0) {
					await customerProductRepo.batchUpdate({
						ctx,
						updates: rows.map((row) => ({
							id: row.customerProduct.id,
							updates: {
								status: CusProductStatus.Expired,
							},
						})),
					});
					const customersToDelete = rows.map((row) => ({
						orgId: row.customer.org_id,
						env: row.customer.env as AppEnv,
						customerId: row.customer.id ?? "",
					}));
					const featuresByOrgEnv = orgToFeaturesByOrgEnv({
						org,
						env: ctx.env,
						features,
					});

					await batchInvalidateCachedFullSubjects({
						customers: customersToDelete,
						featuresByOrgEnv,
					});
					console.log(`Expired ${rows.length} customer products`);
					continue;
				}

				const processBatchSize = 250;
				for (let i = 0; i < rows.length; i += processBatchSize) {
					const batch = rows.slice(i, i + processBatchSize);
					await Promise.all(
						batch.map((row) =>
							processExpiredTrialRow({
								ctx,
								customerProduct: row.customerProduct,
								customer: row.customer,
								defaultProducts,
							}),
						),
					);
				}
			}

			totalExpired += results.length;
			console.log(`Expired ${totalExpired} customer products so far`);

			if (results.length < batchSize) break;
		}

		console.log(`Product cron finished: expired ${totalExpired} total`);
	} catch (error) {
		console.log("Error running product cron:", error);
	}
};
