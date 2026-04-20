import {
	ACTIVE_STATUSES,
	type AppEnv,
	type Feature,
	type Organization,
	customerPrices,
	customerProducts,
	customers,
} from "@autumn/shared";
import {
	and,
	eq,
	type InferSelectModel,
	inArray,
	isNotNull,
	lt,
	notExists,
	sql,
} from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import { createWorkerAutumnContext } from "@/utils/workerUtils/createAutumnContext";
import type { CronContext } from "../utils/CronContext";

export type ExpiredTrialRow = {
	customerProduct: InferSelectModel<typeof customerProducts>;
	customer: InferSelectModel<typeof customers>;
};

export type OrgEnvExpiredTrials = {
	ctx: AutumnContext;
	org: Organization;
	features: Feature[];
	rows: ExpiredTrialRow[];
};

export const fetchExpiredTrialProducts = async ({
	batchSize,
	db,
}: {
	batchSize: number;
	db: DrizzleCli;
}) => {
	return db
		.select({
			customerProduct: customerProducts,
			customer: customers,
		})
		.from(customerProducts)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				notExists(
					db
						.select()
						.from(customerPrices)
						.where(eq(customerPrices.customer_product_id, customerProducts.id)),
				),
				inArray(customerProducts.status, ACTIVE_STATUSES),
				isNotNull(customerProducts.trial_ends_at),
				lt(
					customerProducts.trial_ends_at,
					sql`(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`,
				),
			),
		)
		.limit(batchSize);
};

export const groupByOrgEnv = async ({
	results,
	cronContext,
}: {
	results: ExpiredTrialRow[];
	cronContext: CronContext;
}): Promise<OrgEnvExpiredTrials[]> => {
	const byOrgEnv = new Map<
		string,
		{ orgId: string; env: AppEnv; rows: ExpiredTrialRow[] }
	>();

	for (const row of results) {
		const key = `${row.customer.org_id}:${row.customer.env}`;
		const existing = byOrgEnv.get(key);
		if (existing) {
			existing.rows.push(row);
		} else {
			byOrgEnv.set(key, {
				orgId: row.customer.org_id,
				env: row.customer.env as AppEnv,
				rows: [row],
			});
		}
	}

	const groups: OrgEnvExpiredTrials[] = [];
	for (const { orgId, env, rows } of byOrgEnv.values()) {
		const ctx = await createWorkerAutumnContext({
			db: cronContext.db,
			orgId,
			env,
			logger: cronContext.logger,
			workerId: generateId("product-cron"),
		});

		groups.push({
			ctx,
			org: ctx.org,
			features: ctx.features,
			rows,
		});
	}

	return groups;
};
