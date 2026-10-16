/**
 * `combine: "max"` with priced items: only plan items with no price compete,
 * anything with a price (prepaid or usage-based) adds on top.
 *
 * Contract:
 *   - Main plan 2 seats + add-on 5 seats, both unpriced → 5 (PRD case 3).
 *   - Plus 3 prepaid seats bought → 5 + 3 = 8 (PRD case 4). The main plan's base
 *     price does not make its seat item priced.
 *   - 1,000 included + 500 prepaid → 1,500 (PRD case 5).
 *   - 100 included on a prepaid item + 300 unpriced → 400 (PRD case 7).
 *   - Two usage-based items 1,000 + 5,000 → 6,000, as today (PRD case 6).
 */

import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	constructArrearItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";

const seats = (count: number) =>
	constructFeatureItem({
		featureId: TestFeature.CombineMaxSeats,
		includedUsage: count,
		interval: null,
	});

test.concurrent(
	chalk.yellowBright(
		"combine max: unpriced seats compete, bought seats add on top",
	),
	async () => {
		const customerId = "combine-max-priced-seats";
		const pro = products.pro({
			id: "combine-max-seats-pro",
			items: [seats(2)],
		});
		const team = products.base({
			id: "combine-max-seats-team",
			isAddOn: true,
			items: [seats(5)],
		});
		const extraSeats = products.recurringAddOn({
			id: "combine-max-seats-extra",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.CombineMaxSeats,
					price: 10,
					billingUnits: 1,
				}),
			],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, team, extraSeats] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: team.id }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxSeats,
			granted: 5,
			remaining: 5,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: extraSeats.id,
			feature_quantities: [
				{ feature_id: TestFeature.CombineMaxSeats, quantity: 3 },
			],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxSeats,
			granted: 8,
			remaining: 8,
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"combine max: prepaid grants add on top, included prepaid too",
	),
	async () => {
		const customerId = "combine-max-priced-prepaid";
		const included = products.base({
			id: "combine-max-prepaid-included",
			items: [
				constructFeatureItem({
					featureId: TestFeature.CombineMaxMessages,
					includedUsage: 1000,
				}),
			],
		});
		const competitor = products.base({
			id: "combine-max-prepaid-competitor",
			isAddOn: true,
			items: [
				constructFeatureItem({
					featureId: TestFeature.CombineMaxMessages,
					includedUsage: 300,
				}),
			],
		});
		const topUp = products.recurringAddOn({
			id: "combine-max-prepaid-topup",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.CombineMaxMessages,
					includedUsage: 100,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [included, competitor, topUp] }),
			],
			actions: [
				s.billing.attach({ productId: included.id }),
				s.billing.attach({ productId: competitor.id }),
			],
		});

		// 1,000 and 300 compete.
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxMessages,
			granted: 1000,
			remaining: 1000,
		});

		// A priced item's 500 (100 included + 400 bought) all adds on top.
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: topUp.id,
			feature_quantities: [
				{ feature_id: TestFeature.CombineMaxMessages, quantity: 500 },
			],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxMessages,
			granted: 1500,
			remaining: 1500,
		});
	},
);

test.concurrent(
	chalk.yellowBright("combine max: usage-based items still add up"),
	async () => {
		const customerId = "combine-max-usage-based";
		const planA = products.pro({
			id: "combine-max-arrear-a",
			items: [
				constructArrearItem({
					featureId: TestFeature.CombineMaxMessages,
					includedUsage: 1000,
					price: 0.01,
					billingUnits: 1,
				}),
			],
		});
		const planB = products.recurringAddOn({
			id: "combine-max-arrear-b",
			items: [
				constructArrearItem({
					featureId: TestFeature.CombineMaxMessages,
					includedUsage: 5000,
					price: 0.005,
					billingUnits: 1,
				}),
			],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [planA, planB] }),
			],
			actions: [
				s.billing.attach({ productId: planA.id }),
				s.billing.attach({ productId: planB.id }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxMessages,
			granted: 6000,
			remaining: 6000,
		});
	},
);
