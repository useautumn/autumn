import { AppEnv, customers } from "@autumn/shared";
import { inArray, sql } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron.js";
import { runResetCron } from "@/cron/resetCron/runResetCron.js";
import { runOneOffExpiry } from "@/cron/oneoffCron/runOneOffExpiry.js";
import { runOneOffCleanup } from "@/cron/oneoffCron/runOneOffCleanup.js";
import type { CronContext } from "@/cron/utils/CronContext.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

const resolveTestClockCustomers = async ({
	ctx,
	testClockId,
}: {
	ctx: StripeWebhookContext;
	testClockId: string;
}): Promise<string[]> => {
	const { stripeCli, db } = ctx;

	const stripeCustomerIds: string[] = [];
	for await (const cus of stripeCli.customers.list({
		test_clock: testClockId,
		limit: 100,
	})) {
		stripeCustomerIds.push(cus.id);
	}

	if (stripeCustomerIds.length === 0) return [];

	const rows = await db
		.select({ internal_id: customers.internal_id })
		.from(customers)
		.where(
			inArray(sql`${customers.processor}->>'id'`, stripeCustomerIds),
		);

	return rows.map((r) => r.internal_id);
};

export const handleTestClockReady = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { logger, db, env, stripeEvent } = ctx;

	if (env !== AppEnv.Sandbox) return;

	const testClock = stripeEvent.data.object as {
		id: string;
		frozen_time: number;
	};

	const frozenTimeMs = testClock.frozen_time * 1000;
	logger.info(
		`test_clock.ready: clock=${testClock.id}, frozen_time=${new Date(frozenTimeMs).toISOString()}`,
	);

	const internalCustomerIds = await resolveTestClockCustomers({
		ctx,
		testClockId: testClock.id,
	});

	if (internalCustomerIds.length === 0) {
		logger.info("test_clock.ready: no Autumn customers on this clock");
		return;
	}

	logger.info(
		`test_clock.ready: found ${internalCustomerIds.length} customers, running cron jobs`,
	);

	const cronCtx: CronContext = { db, logger };

	await Promise.all([
		runProductCron({ ctx: cronCtx, nowMs: frozenTimeMs, internalCustomerIds }),
		runResetCron({
			ctx: cronCtx,
			customDateUnix: frozenTimeMs,
			internalCustomerIds,
		}),
		runOneOffExpiry({
			ctx: cronCtx,
			nowMs: frozenTimeMs,
			internalCustomerIds,
		}),
		runOneOffCleanup({ ctx: cronCtx, internalCustomerIds }),
	]);

	logger.info("test_clock.ready: all cron jobs completed");
};
