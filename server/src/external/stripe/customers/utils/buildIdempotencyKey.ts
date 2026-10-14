import { hashString } from "@autumn/shared";
import { AUTUMN_STRIPE_IDEMPOTENCY_PREFIX } from "@/external/stripe/common/autumnStripeIdempotency";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const buildStripeCustomerIdempotencyKey = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): string => {
	const { org, env } = ctx;
	return `${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}customer:${hashString(
		`stripe-create-cus:${customerId}:${org.id}:${env}:${Math.floor(Date.now() / 5000)}`,
	)}`;
};
