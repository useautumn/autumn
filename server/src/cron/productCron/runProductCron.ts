import { ms } from "@autumn/shared";
import { PlanService } from "@/internal/products/PlanService";
import type { CronContext } from "../utils/CronContext";
import {
	type ExpiredTrialRow,
	type OrgEnvExpiredTrials,
	fetchExpiredTrialProducts,
	groupByOrgEnv,
} from "./fetchExpiredTrialProducts";
import { processExpiredTrialRow } from "./processExpiredTrialRow";

const partitionRevertRows = (rows: ExpiredTrialRow[]) => {
	const revert: ExpiredTrialRow[] = [];
	const standard: ExpiredTrialRow[] = [];
	for (const row of rows) {
		if (row.customerProduct.on_trial_end === "revert") {
			revert.push(row);
		} else {
			standard.push(row);
		}
	}
	return { revert, standard };
};

const BATCH_SIZE = 250;

const processRowsInBatches = async ({
	ctx,
	rows,
	defaultProducts,
}: {
	ctx: OrgEnvExpiredTrials["ctx"];
	rows: ExpiredTrialRow[];
	defaultProducts: Awaited<ReturnType<typeof PlanService.listDefault>>;
}) => {
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
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

			const results = await fetchExpiredTrialProducts({ batchSize, db });

			if (results.length === 0) break;

			console.log(
				`Product cron iteration ${iteration}: processing ${results.length} expired trials`,
			);

			const resultsByOrgEnv = await groupByOrgEnv({ results, cronContext });

			for (const { ctx, rows } of resultsByOrgEnv) {
				const { revert: revertRows, standard: standardRows } =
					partitionRevertRows(rows);

				if (revertRows.length > 0) {
					await processRowsInBatches({
						ctx,
						rows: revertRows,
						defaultProducts: [],
					});
				}

				if (standardRows.length === 0) continue;

				const defaultProducts = await PlanService.listDefault({
					db: ctx.db,
					orgId: ctx.org.id,
					env: ctx.env,
					onlyFree: true,
				});

				// Always route through `processExpiredTrialRow` so the
				// `billing.updated` webhook (tagged "trial_ended") fires from
				// a single emission site — regardless of whether a free default
				// is being activated alongside the expiry.
				await processRowsInBatches({
					ctx,
					rows: standardRows,
					defaultProducts,
				});
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
