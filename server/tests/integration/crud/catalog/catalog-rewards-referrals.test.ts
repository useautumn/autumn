import { expect, test } from "bun:test";
import {
	ApiRewardsListV0Schema,
	CouponDurationType,
	EntitlementDuration,
	RewardReceivedBy,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

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
});
