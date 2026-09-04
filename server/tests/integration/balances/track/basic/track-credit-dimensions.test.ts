/**
 * Contract: a dimensioned rate-card row prices a track by its properties —
 * the most specific matching dimension sets the rate, multipliers scale it,
 * no match falls back to the row's rate — on both the cached and persisted
 * paths, with per-dimension attribution and per-dimension tier progress, and
 * a finalize repricing at the properties the check locked with.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	customerEntitlements,
	type FeatureConfigOverride,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";

const dimensionedAction1: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
				large_eu: {
					match: { size: "large", region: "eu" },
					credit_amount: 20,
				},
				xl: {
					match: { size: "xl" },
					tier_behavior: "graduated",
					tiers: [
						{ to: 5, credit_amount: 2 },
						{ to: "inf", credit_amount: 1 },
					],
				},
			},
			multipliers: {
				spot: { match: { lifecycle: "spot" }, factor: 0.3 },
			},
		},
	],
};

const withFeatureOverride = (
	item: ReturnType<typeof items.consumable>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

const expectCreditsBalance = async ({
	autumnV1,
	customerId,
	balance,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	balance: number;
}) => {
	const cached = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(cached.features[TestFeature.InvoiceCredits]?.balance).toBeCloseTo(
		balance,
		8,
	);
	await timeout(2_000);
	const persisted = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(persisted.features[TestFeature.InvoiceCredits]?.balance).toBeCloseTo(
		balance,
		8,
	);
};

const setupDimensionedCredits = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const creditsItem = withFeatureOverride(
		items.consumable({
			featureId: TestFeature.InvoiceCredits,
			includedUsage: 1_000,
			price: 1,
			billingUnits: 1,
		}),
		dimensionedAction1,
	);
	const product = products.base({ id: customerId, items: [creditsItem] });

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [product] }),
		],
		actions: [s.billing.attach({ productId: product.id })],
	});
};

const readAttribution = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	internalCustomerId: string;
}) => {
	const [row] = await ctx.db
		.select({ usageAttribution: customerEntitlements.usage_attribution })
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.internal_customer_id, internalCustomerId),
				eq(customerEntitlements.feature_id, TestFeature.InvoiceCredits),
			),
		)
		.limit(1);
	return row?.usageAttribution ?? {};
};

test.concurrent(
	`${chalk.yellowBright("track-credit-dimensions: the matching dimension and multipliers price the track")}`,
	async () => {
		const customerId = "track-credit-dimensions-match";
		const { autumnV1, autumnV2_3, ctx, customer } =
			await setupDimensionedCredits({ customerId });
		const action1InternalId = ctx.features.find(
			(feature) => feature.id === TestFeature.Action1,
		)?.internal_id;

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
			properties: { size: "large", region: "eu", lifecycle: "spot" },
		});
		await expectCreditsBalance({ autumnV1, customerId, balance: 1_000 - 60 });

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
			properties: { size: "large" },
		});
		await expectCreditsBalance({
			autumnV1,
			customerId,
			balance: 1_000 - 60 - 160,
		});

		await timeout(3_000);
		expect(
			await readAttribution({ ctx, internalCustomerId: customer.internal_id }),
		).toEqual({
			[`${action1InternalId}::large_eu`]: { units: 10, credits: 60 },
			[`${action1InternalId}::large`]: { units: 10, credits: 160 },
		});
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("track-credit-dimensions: no match and no properties price at the row's rate")}`,
	async () => {
		const customerId = "track-credit-dimensions-fallback";
		const { autumnV1, autumnV2_3 } = await setupDimensionedCredits({
			customerId,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
			properties: { size: "xxl" },
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
		});
		await expectCreditsBalance({ autumnV1, customerId, balance: 1_000 - 20 });
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("track-credit-dimensions: a graduated dimension climbs its own ladder")}`,
	async () => {
		const customerId = "track-credit-dimensions-graduated";
		const { autumnV1, autumnV2_3, ctx, customer } =
			await setupDimensionedCredits({ customerId });
		const action1InternalId = ctx.features.find(
			(feature) => feature.id === TestFeature.Action1,
		)?.internal_id;

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 3,
			properties: { size: "xl" },
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 4,
			properties: { size: "xl" },
		});
		// 3 @ 2 = 6, then 2 @ 2 + 2 @ 1 = 6 — the second track crosses the tier.
		await expectCreditsBalance({ autumnV1, customerId, balance: 1_000 - 12 });

		await timeout(3_000);
		expect(
			await readAttribution({ ctx, internalCustomerId: customer.internal_id }),
		).toEqual({ [`${action1InternalId}::xl`]: { units: 7, credits: 12 } });
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("track-credit-dimensions: finalize reprices at the properties the check locked with")}`,
	async () => {
		const customerId = "track-credit-dimensions-finalize";
		const { autumnV1, autumnV2_3 } = await setupDimensionedCredits({
			customerId,
		});
		const lockId = `${customerId}-lock`;

		const check = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			properties: { size: "large", region: "eu" },
			lock: { enabled: true, lock_id: lockId },
		});
		expect(check.allowed).toBe(true);
		await expectCreditsBalance({ autumnV1, customerId, balance: 1_000 - 200 });

		await autumnV2_3.balances.finalize({
			lock_id: lockId,
			action: "confirm",
			override_value: 5,
		});
		await expectCreditsBalance({ autumnV1, customerId, balance: 1_000 - 100 });
	},
	{ timeout: 120_000 },
);
