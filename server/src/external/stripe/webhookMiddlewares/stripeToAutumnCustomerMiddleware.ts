import { RELEVANT_STATUSES } from "@autumn/shared";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";
import { CusService } from "../../../internal/customers/CusService";
import { getStripeCustomerId } from "../stripeWebhookQueue.js";
import type { StripeWebhookContext } from "./stripeWebhookContext";

const getAutumnCustomerId = async ({ ctx }: { ctx: StripeWebhookContext }) => {
	const stripeCustomerId = getStripeCustomerId({ event: ctx.stripeEvent });
	if (!stripeCustomerId) return;

	const cus = await CusService.getByStripeId({
		ctx,
		stripeId: stripeCustomerId as string,
	});

	if (!cus) return;

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: cus.internal_id,
		withEntities: true,
		withSubs: true,
		inStatuses: RELEVANT_STATUSES,
		allowNotFound: true,
	});

	ctx.fullCustomer = fullCustomer;
};

export const getStripeWebhookContextWithCustomer = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): Promise<StripeWebhookContext> => {
	await getAutumnCustomerId({ ctx });

	const customerId =
		ctx.fullCustomer?.id || ctx.fullCustomer?.internal_id || undefined;
	if (!customerId) return ctx;

	return getCtxWithCustomerRedis({
		ctx: {
			...ctx,
			customerId,
			rolloutSnapshot: computeRolloutSnapshot({
				orgId: ctx.org.id,
				customerId,
			}),
		},
		customerId,
	}).ctx as StripeWebhookContext;
};
