/**
 * TDD repro for two reported reward/coupon bugs.
 *
 * Bug 1 — duplicate id+code allowed:
 *  POST /rewards twice with the SAME id and SAME promo code but different
 *  discount config succeeds both times, leaving two reward rows.
 *  Red (current): second create succeeds. Green (after fix): second create errors.
 *
 * Bug 2 — reusing a promo code leaks a raw "already exists in Stripe" error:
 *  Because Bug 1 allows duplicate codes, creating a second reward whose promo
 *  code is already owned by an active reward surfaces the low-level Stripe guard
 *  (PromoCodeAlreadyExistsInStripe) instead of a clean reward-layer rejection.
 *  This is the same error the customer hit recreating after a sibling duplicate
 *  kept an active promo. Note: a plain delete→recreate of the SAME id works in
 *  this harness — delete deactivates the promo — so the conflict only arises
 *  from the duplicate-code situation Bug 1 permits.
 *  Red (current): create leaks PromoCodeAlreadyExistsInStripe.
 *  Green (after fix): duplicate code is rejected at the reward layer (or handled).
 */

import { test, expect } from "bun:test";
import chalk from "chalk";
import {
	CouponDurationType,
	type CreateReward,
	ErrCode,
	RewardType,
} from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const buildReward = ({
	id,
	code,
	type,
	value,
}: {
	id: string;
	code: string;
	type: RewardType;
	value: number;
}): CreateReward => ({
	id,
	name: id,
	type,
	promo_codes: [{ code }],
	discount_config: {
		discount_value: value,
		duration_type: CouponDurationType.OneOff,
		duration_value: 1,
		apply_to_all: true,
		price_ids: [],
	},
});

test(
	`${chalk.yellowBright("rewards bug1: duplicate id+code with different discount is rejected")}`,
	async () => {
		const customerId = "rcd-bug1-cust";
		const suffix = `${Date.now()}`.slice(-7);
		const rewardId = `rcd-dupe-${suffix}`;
		const code = `RCDDUPE${suffix}`;

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({})],
			actions: [],
		});

		// First create: fixed $3000 off
		await autumnV2_2.post(
			"/rewards",
			buildReward({
				id: rewardId,
				code,
				type: RewardType.FixedDiscount,
				value: 3000,
			}),
		);

		// Second create: SAME id + code, but 100% percentage off
		let errorCode: string | undefined;
		try {
			await autumnV2_2.post(
				"/rewards",
				buildReward({
					id: rewardId,
					code,
					type: RewardType.PercentageDiscount,
					value: 100,
				}),
			);
		} catch (e) {
			errorCode = (e as { code?: string }).code;
		}

		// Duplicate id must be rejected with the specific reward-layer error, not
		// silently accepted (which used to create a 2nd row).
		expect(errorCode).toBe(ErrCode.DuplicateRewardId);
	},
);

test(
	`${chalk.yellowBright("rewards bug1b: duplicate promo codes within one payload are rejected before Stripe")}`,
	async () => {
		const customerId = "rcd-bug1b-cust";
		const suffix = `${Date.now()}`.slice(-7);
		const code = `RCDINTRA${suffix}`;

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({})],
			actions: [],
		});

		const reward = buildReward({
			id: `rcd-intra-${suffix}`,
			code,
			type: RewardType.FixedDiscount,
			value: 3000,
		});
		reward.promo_codes = [{ code }, { code }];

		let errorCode: string | undefined;
		try {
			await autumnV2_2.post("/rewards", reward);
		} catch (e) {
			errorCode = (e as { code?: string }).code;
		}

		// Must be caught at the reward layer, not leak PromoCodeAlreadyExistsInStripe.
		expect(errorCode).toBe(ErrCode.DuplicatePromoCode);
	},
);

test(
	`${chalk.yellowBright("rewards bug2: reusing an active promo code must not leak a raw Stripe error")}`,
	async () => {
		const customerId = "rcd-bug2-cust";
		const suffix = `${Date.now()}`.slice(-7);
		const code = `RCDRECREATE${suffix}`;

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({})],
			actions: [],
		});

		// First reward owns an active promo for `code`.
		await autumnV2_2.post(
			"/rewards",
			buildReward({
				id: `rcd-recreate-a-${suffix}`,
				code,
				type: RewardType.FixedDiscount,
				value: 3000,
			}),
		);

		// Second reward reuses the same code (Bug 1 lets this through to Stripe).
		let errorCode: string | undefined;
		try {
			await autumnV2_2.post(
				"/rewards",
				buildReward({
					id: `rcd-recreate-b-${suffix}`,
					code,
					type: RewardType.PercentageDiscount,
					value: 100,
				}),
			);
		} catch (e) {
			errorCode = (e as { code?: string }).code;
		}

		// Must reject the duplicate code cleanly at the reward layer, not leak the
		// low-level Stripe guard (PromoCodeAlreadyExistsInStripe).
		expect(errorCode).toBe(ErrCode.DuplicatePromoCode);
	},
);
