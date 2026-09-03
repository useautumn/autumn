import { createHash } from "node:crypto";
import { priceToStripePriceIdempotencyShape, type Price } from "@autumn/shared";
import { AUTUMN_STRIPE_IDEMPOTENCY_PREFIX } from "@/external/stripe/common/autumnStripeIdempotency";

const hashStripePriceIdempotencyShape = ({
	price,
	currency,
	orgDefault,
}: {
	price: Price;
	currency: string;
	orgDefault: string;
}) =>
	createHash("sha256")
		.update(
			JSON.stringify(
				priceToStripePriceIdempotencyShape({ price, currency, orgDefault }),
			),
		)
		.digest("hex")
		.slice(0, 16);

/**
 * The Stripe product is part of the key because it is a `prices.create`
 * parameter the hashed shape does not cover: re-minting one Autumn price under
 * a new product is a different request, and Stripe rejects a reused key whose
 * parameters changed.
 */
export const buildStripePriceIdempotencyKey = ({
	price,
	slot,
	currency,
	orgDefault,
	stripeProductId,
}: {
	price: Price;
	slot: string;
	currency: string;
	orgDefault: string;
	stripeProductId: string;
}) =>
	`${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}price:${price.id}:${slot}:${currency}:${stripeProductId}:${hashStripePriceIdempotencyShape({ price, currency, orgDefault })}`;

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
