import { ms } from "@autumn/shared";
import { ProductService } from "@/internal/products/ProductService";
import type { CronContext } from "../utils/CronContext";
import {
	type ExpiredTrialRow,
	fetchExpiredTrialProducts,
	groupByOrgEnv,
	type OrgEnvExpiredTrials,
} from "./fetchExpiredTrialProducts";
import { processExpiredTrialRow } from "./processExpiredTrialRow";

const groupRowsByCustomer = (rows: ExpiredTrialRow[]) => {
	const rowsByCustomer = new Map<string, ExpiredTrialRow[]>();
	for (const row of rows) {
		const customerRows = rowsByCustomer.get(row.customer.internal_id) ?? [];
		customerRows.push(row);
		rowsByCustomer.set(row.customer.internal_id, customerRows);
	}
	return [...rowsByCustomer.values()];
};

const BATCH_SIZE = 250;

const processRowsInBatches = async ({
	ctx,
	rows,
	defaultProducts,
}: {
	ctx: OrgEnvExpiredTrials["ctx"];
	rows: ExpiredTrialRow[];
	defaultProducts: Awaited<ReturnType<typeof ProductService.listDefault>>;
}) => {
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		// A customer's rows run in order so converting trials share one subscription.
		await Promise.all(
			groupRowsByCustomer(batch).map(async (customerRows) => {
				for (const row of customerRows) {
					await processExpiredTrialRow({
						ctx,
						customerProduct: row.customerProduct,
						customer: row.customer,
						defaultProducts,
					});
				}
			}),
		);
	}
};

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

			const results = await fetchExpiredTrialProducts({
				batchSize,
				db,
				nowMs: Date.now(),
			});

			if (results.length === 0) break;

			console.log(
				`Product cron iteration ${iteration}: processing ${results.length} expired trials`,
			);

			const resultsByOrgEnv = await groupByOrgEnv({ results, cronContext });

			for (const { ctx, rows } of resultsByOrgEnv) {
				const defaultProducts = await ProductService.listDefault({
					db: ctx.db,
					orgId: ctx.org.id,
					env: ctx.env,
					onlyFree: true,
				});

				// Always route through `processExpiredTrialRow` so the
				// `billing.updated` webhook (tagged "trial_ended") fires from
				// a single emission site — regardless of whether a free default
				// is being activated alongside the expiry.
				await processRowsInBatches({ ctx, rows, defaultProducts });
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
