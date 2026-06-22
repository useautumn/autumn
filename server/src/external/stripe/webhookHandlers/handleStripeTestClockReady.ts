import { RELEVANT_STATUSES, secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { resetCustomerEntitlements } from "@/internal/customers/actions/resetCustomerEntitlements/resetCustomerEntitlements.js";
import { CusService } from "@/internal/customers/CusService.js";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";

export const handleStripeTestClockReady = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.TestHelpersTestClockReadyEvent;
}) => {
	const { stripeCli, logger } = ctx;
	const testClock = event.data.object;

	const stripeCustomers = await stripeCli.customers.list({
		test_clock: testClock.id,
		limit: 100,
	});

	for (const stripeCustomer of stripeCustomers.data) {
		const customer = await CusService.getByStripeId({
			ctx,
			stripeId: stripeCustomer.id,
		});

		if (!customer) {
			logger.info(
				`[test_clock.ready] No Autumn customer found for Stripe customer ${stripeCustomer.id}`,
			);
			continue;
		}

		const { ctx: routedCtx } = getCtxWithCustomerRedis({
			ctx: {
				...ctx,
				customerId: customer.id || customer.internal_id,
				rolloutSnapshot: computeRolloutSnapshot({
					orgId: ctx.org.id,
					customerId: customer.id || customer.internal_id,
				}),
			},
		});

		const fullCustomer = await CusService.getFull({
			ctx: routedCtx,
			idOrInternalId: customer.internal_id,
			withEntities: true,
			withSubs: true,
			inStatuses: RELEVANT_STATUSES,
			allowNotFound: true,
			skipReset: true,
		});

		await resetCustomerEntitlements({
			ctx: routedCtx,
			fullCus: fullCustomer,
			now: secondsToMs(testClock.frozen_time),
		});
	}
};
