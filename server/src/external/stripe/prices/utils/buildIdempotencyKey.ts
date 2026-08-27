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

export const buildStripePriceIdempotencyKey = ({
	price,
	slot,
	currency,
	orgDefault,
}: {
	price: Price;
	slot: string;
	currency: string;
	orgDefault: string;
}) =>
	`${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}price:${price.id}:${slot}:${currency}:${hashStripePriceIdempotencyShape({ price, currency, orgDefault })}`;

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
