import {
	type AutoTopup,
	customerEntitlements,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	type FullCustomerPrice,
	orgToCurrency,
	priceToInvoiceAmount,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { eq } from "drizzle-orm";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { redis } from "@/external/redis/initRedis.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { incrementAutoTopUpCounter } from "./autoTopUpRateLimit.js";

/** Execute the auto top-up: charge the card and increment the entitlement balance. */
export const executeAutoTopUp = async ({
	ctx,
	fullCustomer,
	feature,
	autoTopupConfig,
	cusEnts,
	cusPrice,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	feature: Feature;
	autoTopupConfig: AutoTopup;
	cusEnts: FullCusEntWithFullCusProduct[];
	cusPrice: FullCustomerPrice;
}) => {
	const { org, env, logger } = ctx;

	logger.info(
		`[executeAutoTopUp] Starting auto top-up for feature ${feature.id}, quantity: ${autoTopupConfig.quantity}`,
	);

	// 1. Init Stripe client
	const stripeCli = createStripeCli({ org, env });

	// 2. Get payment method
	const stripeCustomerId = fullCustomer.processor?.id;

	if (!stripeCustomerId) {
		logger.warn(
			`[executeAutoTopUp] No Stripe customer ID for customer ${fullCustomer.id || fullCustomer.internal_id}`,
		);
		return;
	}

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: stripeCustomerId,
	});

	if (!paymentMethod) {
		logger.warn(
			`[executeAutoTopUp] No payment method for customer ${stripeCustomerId}`,
		);
		return;
	}

	// 3. Calculate invoice amount
	const amount = priceToInvoiceAmount({
		price: cusPrice.price,
		quantity: autoTopupConfig.quantity,
	});

	if (amount <= 0) {
		logger.warn(
			`[executeAutoTopUp] Calculated amount is ${amount} for feature ${feature.id}, skipping`,
		);
		return;
	}

	// 4. Create + pay Stripe invoice
	const priceConfig = cusPrice.price.config as UsagePriceConfig;
	const currency = orgToCurrency({ org });

	const stripeProductId =
		priceConfig.stripe_product_id ||
		cusEnts[0]?.customer_product?.product?.processor?.id;

	if (!stripeProductId) {
		logger.warn(
			`[executeAutoTopUp] No Stripe product ID found for feature ${feature.id}, skipping`,
		);
		return;
	}

	const createdInvoice = await stripeCli.invoices.create({
		customer: stripeCustomerId,
		auto_advance: false,
		currency,
	});

	const invoiceId = createdInvoice.id;

	if (!invoiceId) {
		logger.warn(
			`[executeAutoTopUp] Stripe returned invoice without id for feature ${feature.id}, skipping`,
		);
		return;
	}

	await stripeCli.invoiceItems.create({
		customer: stripeCustomerId,
		invoice: invoiceId,
		description: `Auto top-up: ${autoTopupConfig.quantity} ${feature.name || feature.id}`,
		price_data: {
			unit_amount: new Decimal(amount).mul(100).round().toNumber(),
			currency,
			product: stripeProductId,
		},
		quantity: 1,
	});

	await stripeCli.invoices.finalizeInvoice(invoiceId);

	const { paid } = await payForInvoice({
		stripeCli,
		invoiceId,
		paymentMethod,
		logger,
		errorOnFail: false,
		voidIfFailed: true,
	});

	if (!paid) {
		logger.error(
			`[executeAutoTopUp] Payment failed for feature ${feature.id}, invoice ${invoiceId}`,
		);
		return;
	}

	// 5. Increment balance in both stores (no cache_version bump,
	//    so the batching sync can still reconcile without version mismatch).
	const cusEnt = cusEnts[0];
	const quantity = autoTopupConfig.quantity;
	const customerId = fullCustomer.id || fullCustomer.internal_id;

	// 5a. Atomic Redis increment via Lua script
	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});

	const redisResult = await tryRedisWrite(() =>
		redis.incrementCusEntBalance(
			cacheKey,
			JSON.stringify({ cus_ent_id: cusEnt.id, delta: quantity }),
		),
	);

	if (redisResult) {
		const parsed = JSON.parse(redisResult as string);
		if (!parsed.ok) {
			logger.warn(
				`[executeAutoTopUp] Redis increment failed: ${parsed.error}, feature ${feature.id}`,
			);
		}
	}

	// 5b. Absolute Postgres write using the Redis-sourced balance (no cache_version bump).
	//     We use cusEnt.balance (post-deduction, from Redis) rather than a relative increment
	//     because the async batched sync may not have persisted the deduction to Postgres yet —
	//     Stripe webhooks from the invoice above can delete the Redis cache before the sync runs.
	await ctx.db
		.update(customerEntitlements)
		.set({
			balance: (cusEnt.balance ?? 0) + quantity,
		})
		.where(eq(customerEntitlements.id, cusEnt.id));

	// 6. Increment rate limit counter
	if (autoTopupConfig.max_purchases) {
		await incrementAutoTopUpCounter({
			orgId: org.id,
			env,
			customerId,
			featureId: feature.id,
			maxPurchases: autoTopupConfig.max_purchases,
		});
	}

	logger.info(
		`[executeAutoTopUp] Successfully topped up feature ${feature.id} by ${quantity}`,
	);
};
