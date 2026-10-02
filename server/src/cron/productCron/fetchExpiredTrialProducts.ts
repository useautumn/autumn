import {
	ACTIVE_STATUSES,
	AppEnv,
	customerPrices,
	customerProducts,
	customers,
	type Feature,
	freeTrials,
	type Organization,
	organizations,
	ProcessorType,
} from "@autumn/shared";
import {
	and,
	eq,
	exists,
	type InferSelectModel,
	inArray,
	isNotNull,
	lt,
	notExists,
	or,
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
	nowMs = Date.now(),
	internalCustomerId,
}: {
	batchSize: number;
	db: DrizzleCli;
	nowMs?: number;
	internalCustomerId?: string;
}) => {
	const hasNoPrices = notExists(
		db
			.select()
			.from(customerPrices)
			.where(eq(customerPrices.customer_product_id, customerProducts.id)),
	);

	const isNoCardTrial = exists(
		db
			.select()
			.from(freeTrials)
			.where(
				and(
					eq(freeTrials.id, customerProducts.free_trial_id),
					eq(freeTrials.card_required, false),
				),
			),
	);

	const orgWritesToStripe = notExists(
		db
			.select()
			.from(organizations)
			.where(
				and(
					eq(organizations.id, customers.org_id),
					eq(customers.env, AppEnv.Live),
					sql`(${organizations.config}->>'disable_stripe_writes')::boolean is true`,
				),
			),
	);

	const isUnbilledNoCardTrial = and(
		isNoCardTrial,
		sql`coalesce(cardinality(${customerProducts.subscription_ids}), 0) = 0`,
		sql`coalesce(${customerProducts.processor}->>'type', ${ProcessorType.Stripe}) = ${ProcessorType.Stripe}`,
		orgWritesToStripe,
	);

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
				or(
					hasNoPrices,
					eq(customerProducts.on_trial_end, "revert"),
					isUnbilledNoCardTrial,
				),
				inArray(customerProducts.status, ACTIVE_STATUSES),
				isNotNull(customerProducts.trial_ends_at),
				lt(customerProducts.trial_ends_at, nowMs),
				internalCustomerId
					? eq(customerProducts.internal_customer_id, internalCustomerId)
					: undefined,
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
