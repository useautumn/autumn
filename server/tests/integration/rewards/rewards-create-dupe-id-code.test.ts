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

		await autumnV2_2.post(
			"/rewards",
			buildReward({
				id: rewardId,
				code,
				type: RewardType.FixedDiscount,
				value: 3000,
			}),
		);

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

		await autumnV2_2.post(
			"/rewards",
			buildReward({
				id: `rcd-recreate-a-${suffix}`,
				code,
				type: RewardType.FixedDiscount,
				value: 3000,
			}),
		);

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

		expect(errorCode).toBe(ErrCode.DuplicatePromoCode);
	},
);
