import { expect, test } from "bun:test";
import {
	ApiRewardsListV0Schema,
	CatalogUpdateParamsSchema,
	CouponDurationType,
	EntitlementDuration,
	RewardReceivedBy,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

test("catalog config returns validation issues for malformed rewards", () => {
	const parse = () => CatalogUpdateParamsSchema.safeParse({ rewards: [{}] });

	expect(parse).not.toThrow();
	expect(parse().success).toBe(false);
});

test("catalog config creates idempotent rewards and a redeemable referral program", async () => {
	const suffix = Date.now();
	const referrerId = `catalog-referrer-${suffix}`;
	const referredId = `catalog-referred-${suffix}`;
	const couponId = `catalog-coupon-${suffix}`;
	const grantId = `catalog-grant-${suffix}`;
	const programId = `catalog-program-${suffix}`;
	const included = 300;
	const config = {
		rewards: [
			{
				coupon: {
					id: couponId,
					name: "Launch discount",
					type: RewardType.PercentageDiscount,
					value: 20,
					duration: { type: CouponDurationType.Months, length: 3 },
					plan_ids: null,
					promo_codes: [
						{
							code: `LAUNCH${suffix}`,
							global_max_redemption: 100,
							first_time_transaction: true,
						},
					],
				},
			},
			{
				feature_grant: {
					id: grantId,
					name: "Referral credits",
					grants: [
						{
							feature_id: TestFeature.Credits,
							included,
							expiry: { type: EntitlementDuration.Month, length: 1 },
						},
					],
					promo_codes: [{ code: `REFER${suffix}`, max_uses: 100 }],
				},
			},
		],
		referral_programs: [
			{
				id: programId,
				reward_id: grantId,
				redeem_on: RewardTriggerEvent.CustomerCreation,
				received_by: RewardReceivedBy.All,
				max_redemptions: 5,
			},
		],
	};
	const { autumnV1, autumnV2_2 } = await initScenario({
		customerId: referrerId,
		setup: [
			s.platform.create({ setupDefaultFeatures: true }),
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: referredId, paymentMethod: "success" }]),
		],
		actions: [],
	});

	const preview = (await autumnV2_2.post(
		"/catalog.preview_update",
		config as never,
	)) as any;
	expect(preview.reward_changes).toEqual([
		{ id: couponId, action: "created" },
		{ id: grantId, action: "created" },
	]);
	expect(preview.referral_program_changes).toEqual([
		{ id: programId, action: "created" },
	]);

	const created = (await autumnV2_2.post(
		"/catalog.update",
		config as never,
	)) as any;
	expect(created.rewards).toHaveLength(2);
	expect(created.referral_programs).toHaveLength(1);

	const unchanged = (await autumnV2_2.post(
		"/catalog.preview_update",
		config as never,
	)) as any;
	expect(unchanged.reward_changes.map(({ action }: any) => action)).toEqual([
		"none",
		"none",
	]);
	expect(
		unchanged.referral_program_changes.map(({ action }: any) => action),
	).toEqual(["none"]);

	const { code } = await autumnV1.referrals.createCode({
		customerId: referrerId,
		referralId: programId,
	});
	await autumnV1.referrals.redeem({ customerId: referredId, code });
	for (const customerId of [referrerId, referredId]) {
		const { balance } = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});
		expect(balance).toBe(included);
	}

	const changedConfig = structuredClone(config);
	changedConfig.rewards[1]!.feature_grant!.grants[0]!.included = 999;
	const conflict = (await autumnV2_2.post(
		"/catalog.preview_update",
		changedConfig as never,
	)) as any;
	expect(conflict.reward_changes[1]).toMatchObject({
		id: grantId,
		action: "conflict",
	});
	await expect(
		autumnV2_2.post("/catalog.update", changedConfig as never),
	).rejects.toThrow();
	const rewardsAfterConflict = ApiRewardsListV0Schema.parse(
		await autumnV2_2.post("/rewards.list", {}),
	);
	expect(
		rewardsAfterConflict.feature_grants.find(({ id }) => id === grantId)
			?.grants[0]?.included,
	).toBe(included);

	await autumnV2_2.post("/catalog.update", {});
	const listed = ApiRewardsListV0Schema.parse(
		await autumnV2_2.post("/rewards.list", {}),
	);
	expect(listed.coupons.some(({ id }) => id === couponId)).toBe(true);
	expect(listed.feature_grants.some(({ id }) => id === grantId)).toBe(true);
	expect(
		await autumnV1.referrals.createCode({
			customerId: referrerId,
			referralId: programId,
		}),
	).toMatchObject({ code: expect.any(String) });

	const deletionConfig = {
		rewards: [],
		referral_programs: [],
		skip_deletions: false,
	};
	const deletionPreview = (await autumnV2_2.post(
		"/catalog.preview_update",
		deletionConfig,
	)) as any;
	expect(deletionPreview.reward_changes).toHaveLength(2);
	expect(deletionPreview.reward_changes).toEqual(
		expect.arrayContaining([
			{ id: grantId, action: "deleted" },
			{ id: couponId, action: "deleted" },
		]),
	);
	expect(deletionPreview.referral_program_changes).toEqual([
		{ id: programId, action: "deleted" },
	]);

	await autumnV2_2.post("/catalog.update", deletionConfig);
	const rewardsAfterDeletion = ApiRewardsListV0Schema.parse(
		await autumnV2_2.post("/rewards.list", {}),
	);
	expect(rewardsAfterDeletion.coupons.some(({ id }) => id === couponId)).toBe(
		false,
	);
	expect(
		rewardsAfterDeletion.feature_grants.some(({ id }) => id === grantId),
	).toBe(false);
	await expect(
		autumnV1.referrals.createCode({
			customerId: referrerId,
			referralId: programId,
		}),
	).rejects.toThrow();
});

test.each([CouponDurationType.OneOff, CouponDurationType.Forever])(
	"catalog config treats %s coupons as idempotent",
	async (durationType) => {
		const suffix = `${durationType}-${Date.now()}`;
		const couponId = `catalog-${suffix}`;
		const config = {
			rewards: [
				{
					coupon: {
						id: couponId,
						name: `${durationType} coupon`,
						type: RewardType.PercentageDiscount,
						value: 20,
						duration: { type: durationType, length: null },
						plan_ids: null,
						promo_codes: [],
					},
				},
			],
		};
		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-duration-${suffix}`,
			setup: [s.platform.create({ setupDefaultFeatures: true })],
			actions: [],
		});

		await autumnV2_2.post("/catalog.update", config as never);
		const preview = (await autumnV2_2.post(
			"/catalog.preview_update",
			config as never,
		)) as { reward_changes: { id: string; action: string }[] };

		expect(preview.reward_changes).toEqual([{ id: couponId, action: "none" }]);
	},
);

/** Before: replacing plan prices orphaned coupon plan IDs; after: scoped coupons keep stable plan IDs. */
test("catalog config keeps plan-scoped coupons idempotent across plan updates", async () => {
	const suffix = Date.now();
	const planId = `catalog-coupon-plan-${suffix}`;
	const couponId = `catalog-plan-coupon-${suffix}`;
	const config = (amount: number) => ({
		plans: [
			{
				plan_id: planId,
				name: "Coupon plan",
				price: { amount, interval: "month" },
				items: [],
			},
		],
		rewards: [
			{
				coupon: {
					id: couponId,
					name: "Plan coupon",
					type: RewardType.FixedDiscount,
					value: 10,
					duration: { type: CouponDurationType.OneOff, length: null },
					plan_ids: [planId],
					promo_codes: [],
				},
			},
		],
	});
	const { autumnV2_2 } = await initScenario({
		customerId: `catalog-plan-coupon-${suffix}`,
		setup: [s.platform.create({ setupDefaultFeatures: true })],
		actions: [],
	});

	await autumnV2_2.post("/catalog.update", config(29) as never);
	await autumnV2_2.post("/catalog.update", config(39) as never);
	const preview = (await autumnV2_2.post(
		"/catalog.preview_update",
		config(39) as never,
	)) as { reward_changes: { id: string; action: string }[] };

	expect(preview.reward_changes).toEqual([{ id: couponId, action: "none" }]);
});
