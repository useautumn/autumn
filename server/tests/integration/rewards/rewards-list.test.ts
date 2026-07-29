/**
 * Contract test for rewards.list — V0 coupon + feature-grant shapes, partitioning,
 * plan_id / feature_id resolution, promo-code divergence, and no internal-field leakage.
 */

import { expect, test } from "bun:test";
import {
	CouponDurationType,
	type CreateReward,
	EntitlementDuration,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("rewards-list: returns coupons + feature_grants in V0 API shape")}`, async () => {
	const customerId = "rewards-list-1";
	const suffix = Date.now();
	const scopedCode = `RLSCOPED${suffix}`;
	const globalCode = `RLGLOBAL${suffix}`;
	const grantCode = `RLGRANT${suffix}`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	// scoped: productId wires real price_ids -> non-null plan_ids
	const scopedCoupon: CreateReward = {
		id: "rl-coupon-scoped",
		name: "Scoped Percentage",
		type: RewardType.PercentageDiscount,
		promo_codes: [
			{
				code: scopedCode,
				global_max_redemption: 100,
				first_time_transaction: true,
			},
		],
		discount_config: {
			discount_value: 20,
			duration_type: CouponDurationType.Months,
			duration_value: 3,
			apply_to_all: false,
			price_ids: [],
		},
	};

	const globalCoupon: CreateReward = {
		id: "rl-coupon-global",
		name: "Global Credits",
		type: RewardType.InvoiceCredits,
		promo_codes: [{ code: globalCode }],
		discount_config: {
			discount_value: 50,
			duration_type: CouponDurationType.Forever,
			duration_value: 0,
			apply_to_all: true,
			price_ids: [],
		},
	};

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			// Fresh isolated sub-org per run → parallel-safe, no reward accumulation.
			s.platform.create({ setupDefaultFeatures: true }),
			s.customer({ testClock: false }),
			s.products({ list: [pro] }),
			s.reward({ reward: scopedCoupon, productId: pro.id }),
			// apply_to_all=true must win over populated price_ids -> plan_ids null
			s.reward({ reward: globalCoupon, productId: pro.id }),
			s.featureGrant({
				id: "rl-feature-grant",
				name: "Beta Grant",
				entitlements: [
					{
						feature_id: TestFeature.Credits,
						allowance: 1000,
						expiry: { duration: EntitlementDuration.Month, length: 1 },
					},
					// Boolean feature: no allowance, no expiry -> included null, expiry null.
					{ feature_id: TestFeature.Dashboard },
				],
				promoCodes: [{ code: grantCode, max_redemptions: 500 }],
			}),
		],
		actions: [],
	});

	// biome-ignore lint/suspicious/noExplicitAny: client method shape lands with impl
	const list: any = await (autumnV2_2 as any).rewards.list();

	expect(Array.isArray(list.coupons)).toBe(true);
	expect(Array.isArray(list.feature_grants)).toBe(true);
	expect(list.coupons).toHaveLength(2);
	expect(list.feature_grants).toHaveLength(1);

	const scoped = list.coupons.find(
		(c: any) => c.type === RewardType.PercentageDiscount,
	);
	expect(scoped).toBeDefined();
	expect(scoped.value).toBe(20);
	expect(scoped.duration).toEqual({
		type: CouponDurationType.Months,
		length: 3,
	});
	expect(Array.isArray(scoped.plan_ids)).toBe(true);
	expect(scoped.plan_ids).toHaveLength(1);
	expect(scoped.plan_ids[0]).toContain("pro");
	expect(typeof scoped.id).toBe("string");
	expect(scoped.name).toBe("Scoped Percentage");
	expect(typeof scoped.created_at).toBe("number");
	expect(scoped.promo_codes[0].code).toBe(scopedCode);
	expect(scoped.promo_codes[0].global_max_redemption).toBe(100);
	expect(scoped.promo_codes[0].first_time_transaction).toBe(true);
	expect(scoped.promo_codes[0]).not.toHaveProperty("max_uses");
	expect(scoped).not.toHaveProperty("env");
	expect(scoped).not.toHaveProperty("internal_id");
	expect(scoped).not.toHaveProperty("org_id");
	expect(scoped).not.toHaveProperty("discount_config");

	const global = list.coupons.find(
		(c: any) => c.type === RewardType.InvoiceCredits,
	);
	expect(global).toBeDefined();
	expect(global.value).toBe(50);
	expect(global.duration.type).toBe(CouponDurationType.Forever);
	expect(global.duration.length).toBeNull();
	expect(global.plan_ids).toBeNull();

	const fg = list.feature_grants[0];
	expect(typeof fg.id).toBe("string");
	expect(fg.name).toBe("Beta Grant");
	expect(typeof fg.created_at).toBe("number");
	expect(fg).not.toHaveProperty("env");
	expect(fg).not.toHaveProperty("type");
	expect(fg).not.toHaveProperty("entitlements");

	const creditsGrant = fg.grants.find(
		(g: any) => g.feature_id === TestFeature.Credits,
	);
	expect(creditsGrant).toBeDefined();
	expect(creditsGrant.included).toBe(1000);
	expect(creditsGrant.expiry).toEqual({
		type: EntitlementDuration.Month,
		length: 1,
	});
	expect(creditsGrant).not.toHaveProperty("allowance");
	expect(creditsGrant).not.toHaveProperty("internal_feature_id");

	const dashboardGrant = fg.grants.find(
		(g: any) => g.feature_id === TestFeature.Dashboard,
	);
	expect(dashboardGrant).toBeDefined();
	expect(dashboardGrant.included).toBeNull();
	expect(dashboardGrant.expiry).toBeNull();

	expect(fg.promo_codes[0].code).toBe(grantCode);
	expect(fg.promo_codes[0].max_uses).toBe(500);
	expect(fg.promo_codes[0]).not.toHaveProperty("global_max_redemption");
	expect(fg.promo_codes[0]).not.toHaveProperty("first_time_transaction");
});
