/**
 * Price-scoped discounts need the plan's Stripe product ids, which only exist
 * after billing materializes them. Creating one against a never-attached plan
 * must 400 with product_not_in_stripe instead of minting a broken coupon.
 */

import { expect, test } from "bun:test";
import {
	CouponDurationType,
	type CreateReward,
	RewardType,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("rewards: price-scoped discount on a never-attached plan → 400 product_not_in_stripe")}`,
	async () => {
		const pro = products.pro({
			id: "reward-not-in-stripe-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV1, ctx } = await initScenario({
			customerId: "reward-not-in-stripe",
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const reward: CreateReward = {
			id: `reward-not-in-stripe-${Date.now().toString(36)}`,
			name: "Scoped pre-attach",
			type: RewardType.PercentageDiscount,
			promo_codes: [],
			discount_config: {
				discount_value: 20,
				duration_type: CouponDurationType.Months,
				duration_value: 3,
				apply_to_all: false,
				price_ids: fullProduct.prices.map((price) => price.id),
			},
		};

		await expectAutumnError({
			errCode: "product_not_in_stripe",
			func: () => autumnV1.rewards.create(reward),
		});

		// The failed create must not leave a reward row behind.
		const fetched = await autumnV1.rewards
			.get(reward.id)
			.catch(() => undefined);
		expect(fetched?.id).toBeUndefined();
	},
);
