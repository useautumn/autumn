import { hashString } from "@autumn/shared";
import { AUTUMN_STRIPE_IDEMPOTENCY_PREFIX } from "@/external/stripe/common/autumnStripeIdempotency";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Prefixed so webhooks can attribute the event to Autumn; the hash still
 * dedupes concurrent creates within the same 5s bucket. */
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
