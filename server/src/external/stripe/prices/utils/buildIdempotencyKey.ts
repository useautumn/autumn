import { AUTUMN_STRIPE_IDEMPOTENCY_PREFIX } from "@/external/stripe/common/autumnStripeIdempotency";

export const buildStripePriceIdempotencyKey = ({
	priceId,
	slot,
	currency,
}: {
	priceId: string;
	slot: string;
	currency: string;
}) => `${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}price:${priceId}:${slot}:${currency}`;

export const buildStripeProductIdempotencyKey = ({
	productInternalId,
}: {
	productInternalId: string;
}) => `${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}product:${productInternalId}`;

export const buildStripeFeatureProductIdempotencyKey = ({
	featureInternalId,
}: {
	featureInternalId: string;
}) => `${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}product:feature:${featureInternalId}`;

export const buildStripeMeterIdempotencyKey = ({
	priceId,
}: {
	priceId: string;
}) => `${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}meter:${priceId}`;
