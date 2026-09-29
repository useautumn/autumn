import {
	CusProductStatus,
	cusProductsToCusEnts,
	customerEntitlements,
	EntInterval,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { sub } from "date-fns";
import { and, eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { z } from "zod/v4";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { batchResetCustomerEntitlementsV2 } from "@/internal/balances/batchReset/batchResetCustomerEntitlementsV2.js";
import { CusService } from "@/internal/customers/CusService.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { resetEligibleFilterSql } from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

const getRoutedRedisForCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<Redis> => {
	const { ctx: routedCtx } = getCtxWithCustomerRedis({ ctx, customerId });
	await waitForRedisReady(routedCtx.redisV2, "customer-redis", 5000).catch(
		() => undefined,
	);
	return routedCtx.redisV2;
};

/** Patch next_reset_at on a SubjectBalance in the V2 shared balance hash. */
export const setCachedSubjectBalanceField = async ({
	ctx,
	orgId,
	env,
	customerId,
	featureId,
	customerEntitlementId,
	field,
	value,
	redisV2,
}: {
	ctx?: TestContext;
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
	field: string;
	value: number | string | null;
	redisV2?: Redis;
}): Promise<void> => {
	const targetRedisV2 =
		redisV2 ??
		(ctx ? await getRoutedRedisForCustomer({ ctx, customerId }) : null);
	if (!targetRedisV2) {
		throw new Error("setCachedSubjectBalanceField requires redisV2 or ctx");
	}

	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId,
		env,
		customerId,
		featureId,
	});

	const raw = await targetRedisV2.hget(balanceKey, customerEntitlementId);
	if (!raw) return;

	const subjectBalance = JSON.parse(raw);
	subjectBalance[field] = value;
	await targetRedisV2.hset(
		balanceKey,
		customerEntitlementId,
		JSON.stringify(subjectBalance),
	);
};

/**
 * Expire a cusEnt's next_reset_at in Postgres and the V2 subject balance hash,
 * so the next read triggers a lazy reset. Returns the cusEnt for assertions.
 */
export const expireCusEntForReset = async ({
	ctx,
	customerId,
	featureId,
	pastTimeMs,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
	pastTimeMs?: number;
}) => {
	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId,
	});

	if (!cusEnt) {
		throw new Error(
			`cusEnt not found for customer=${customerId} feature=${featureId}`,
		);
	}

	const pastTime = pastTimeMs ?? Date.now() - 1000;
	const routedRedisV2 = await getRoutedRedisForCustomer({ ctx, customerId });

	// Update Postgres
	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: pastTime })
		.where(eq(customerEntitlements.id, cusEnt.id));

	// Update V2 subject balance hash
	await setCachedSubjectBalanceField({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
		customerEntitlementId: cusEnt.id,
		field: "next_reset_at",
		value: pastTime,
		redisV2: routedRedisV2,
	});
	// Written behind the worker's back: it re-hydrates on the next command.
	await evictBalanceWorkerCustomer({ ctx, customerId });

	return cusEnt;
};

/**
 * Expire ALL cusEnts for a given feature in Postgres and the V2 balance hash.
 * Use this for entity-level features where multiple cusEnts share the same feature_id.
 */
export const expireAllCusEntsForReset = async ({
	ctx,
	customerId,
	featureId,
	pastTimeMs,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
	pastTimeMs?: number;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	// cusProductsToCusEnts skips the entity scoping filter — "ALL" here
	// includes entity-scoped products' entitlements.
	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCustomer.customer_products,
		featureIds: [featureId],
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	if (cusEnts.length === 0) {
		throw new Error(
			`No cusEnts found for customer=${customerId} feature=${featureId}`,
		);
	}

	const pastTime = pastTimeMs ?? Date.now() - 1000;
	const routedRedisV2 = await getRoutedRedisForCustomer({ ctx, customerId });

	for (const cusEnt of cusEnts) {
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: pastTime })
			.where(eq(customerEntitlements.id, cusEnt.id));

		await setCachedSubjectBalanceField({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId,
			customerEntitlementId: cusEnt.id,
			field: "next_reset_at",
			value: pastTime,
			redisV2: routedRedisV2,
		});
	}
	// Written behind the worker's back: it re-hydrates on the next command.
	await evictBalanceWorkerCustomer({ ctx, customerId });

	return cusEnts;
};

/** One reset interval back from `reset`, the inverse of `getNextEntitlementReset`. */
const previousEntitlementReset = ({
	reset,
	interval,
	intervalCount,
}: {
	reset: number;
	interval: EntInterval;
	intervalCount: number;
}): number => {
	const date = new UTCDate(reset);
	switch (interval) {
		case EntInterval.Minute:
			return sub(date, { minutes: intervalCount }).getTime();
		case EntInterval.Hour:
			return sub(date, { hours: intervalCount }).getTime();
		case EntInterval.Day:
			return sub(date, { days: intervalCount }).getTime();
		case EntInterval.Week:
			return sub(date, { weeks: intervalCount }).getTime();
		case EntInterval.Month:
			return sub(date, { months: intervalCount }).getTime();
		case EntInterval.Quarter:
			return sub(date, { months: intervalCount * 3 }).getTime();
		case EntInterval.SemiAnnual:
			return sub(date, { months: intervalCount * 6 }).getTime();
		case EntInterval.Year:
			return sub(date, { years: intervalCount }).getTime();
		default:
			throw new Error(`Cannot step back a ${interval} reset`);
	}
};

/** The row as the V2 cron's scan would select it, or null when the scan skips it. */
export const findResetEligibleRow = async ({
	ctx,
	customerEntitlementId,
	dueBefore = Date.now(),
}: {
	ctx: TestContext;
	customerEntitlementId: string;
	dueBefore?: number;
}) => {
	const rows = await ctx.db
		.select({
			id: customerEntitlements.id,
			nextResetAt: customerEntitlements.next_reset_at,
			internalCustomerId: customerEntitlements.internal_customer_id,
			customerProductId: customerEntitlements.customer_product_id,
		})
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.id, customerEntitlementId),
				resetEligibleFilterSql({ dueBefore }),
			),
		);
	return rows[0] ?? null;
};

/** Runs the V2 batch reset (the cron's SQL lane) on exactly these rows, as the SQS consumer would. */
export const runBatchResetOnCustomerEntitlements = ({
	ctx,
	customerEntitlementIds,
}: {
	ctx: TestContext;
	customerEntitlementIds: string[];
}) =>
	batchResetCustomerEntitlementsV2({
		db: ctx.db,
		logger,
		payload: { customerEntitlementIds },
	});

/**
 * Forces one reset cycle on a row through the V2 cron's SQL lane. A row that is not due yet is
 * stepped back whole intervals until it is, so the reset lands on the row's own schedule.
 * Invalidates the customer's caches afterwards (Redis view and worker copy) unless told not to.
 */
export const runResetOnCustomerEntitlement = async ({
	ctx,
	customerId,
	customerEntitlementId,
	skipCacheDeletion = false,
}: {
	ctx: TestContext;
	customerId: string;
	customerEntitlementId: string;
	skipCacheDeletion?: boolean;
}) => {
	const readRow = () =>
		ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, customerEntitlementId),
			with: { entitlement: true },
		});
	const row = await readRow();
	if (!row) throw new Error(`cusEnt ${customerEntitlementId} not found`);
	// Lifetime: nothing to reset, as the cron.
	if (row.next_reset_at === null) return row;

	const now = Date.now();
	let dueAt = row.next_reset_at;
	const interval = z.enum(EntInterval).safeParse(row.entitlement.interval).data;
	while (dueAt > now) {
		if (!interval) {
			dueAt = now - 1_000;
			break;
		}
		dueAt = previousEntitlementReset({
			reset: dueAt,
			interval,
			intervalCount: row.entitlement.interval_count ?? 1,
		});
	}
	if (dueAt !== row.next_reset_at) {
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: dueAt })
			.where(eq(customerEntitlements.id, customerEntitlementId));
	}

	await runBatchResetOnCustomerEntitlements({
		ctx,
		customerEntitlementIds: [customerEntitlementId],
	});

	if (!skipCacheDeletion) {
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "runResetOnCustomerEntitlement",
		});
	}

	const after = await readRow();
	if (!after) throw new Error(`cusEnt ${customerEntitlementId} vanished`);
	return after;
};
