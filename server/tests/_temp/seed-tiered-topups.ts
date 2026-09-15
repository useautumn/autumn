#!/usr/bin/env bun

/**
 * Seeds the master org with customers mirroring an org whose plans refill
 * credits through tiered one-off prepaid items, for manual dashboard testing
 * of tiered auto top-ups. Clears the master org first (`bun cm`) unless
 * `--no-clear` is passed.
 *
 * Refill tiers per credit: ≤75 @ $0.22, ≤125 @ $0.20, ≤250 @ $0.18, then $0.17.
 *
 * Customers (all balances are left just ABOVE the auto top-up threshold, so
 * one small track fires the refill):
 *   bloom-starter          starter-monthly: $10/mo, 25 credits/mo, flat $0.40 one-off refill
 *                          threshold 5, refill 10  -> $4
 *   bloom-scale-volume     scale-1-monthly ($66/mo, 300 credits/mo) + scale-top-up add-on (VOLUME tiers)
 *                          threshold 50, refill 125 -> $25 (125 × 0.20)
 *   bloom-scale-graduated  scale-1-monthly + scale-top-up-graduated add-on (GRADUATED tiers)
 *                          threshold 50, refill 250 -> $49 (75×0.22 + 50×0.20 + 125×0.18)
 *   bloom-scale-same-plan  scale-monthly: monthly VOLUME prepaid (500 credits = $100) AND the
 *                          volume one-off refill item on the SAME plan (the real Scale shape).
 *                          threshold 50, refill 125. Known limitation: the one-off price loses
 *                          the feature-keyed quantity tie-break, so no refill fires yet.
 *
 * Run (from server/):
 *   ENV_FILE=.env infisical run --env=dev --recursive -- bun tests/_temp/seed-tiered-topups.ts
 */

import {
	type ApiCustomerV5,
	type CustomerBillingControlsParams,
	ProductItemInterval,
	TierBehavior,
} from "@autumn/shared";
import { clearMasterOrg } from "@tests/clearMasterOrg.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { createTestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";

const CREDITS = TestFeature.Credits;
const PREFIX = "bloom";

const REFILL_TIERS = [
	{ to: 75, amount: 0.22 },
	{ to: 125, amount: 0.2 },
	{ to: 250, amount: 0.18 },
	{ to: "inf" as const, amount: 0.17 },
];

const SCALE_MONTHLY_TIERS = [
	{ to: 300, amount: 0, flat_amount: 66 },
	{ to: 500, amount: 0, flat_amount: 100 },
	{ to: 1000, amount: 0, flat_amount: 180 },
	{ to: 2000, amount: 0, flat_amount: 340 },
	{ to: 4000, amount: 0, flat_amount: 680 },
	{ to: "inf" as const, amount: 0, flat_amount: 1360 },
];

const volumeRefillItem = () =>
	constructPrepaidItem({
		featureId: CREDITS,
		tiers: REFILL_TIERS,
		tierBehaviour: TierBehavior.VolumeBased,
		billingUnits: 1,
		isOneOff: true,
	});

const graduatedRefillItem = () =>
	constructPrepaidItem({
		featureId: CREDITS,
		tiers: REFILL_TIERS,
		billingUnits: 1,
		isOneOff: true,
	});

const autoTopup = ({
	threshold,
	quantity,
}: {
	threshold: number;
	quantity: number;
}): CustomerBillingControlsParams => ({
	auto_topups: [{ feature_id: CREDITS, enabled: true, threshold, quantity }],
});

const starterMonthly = products.base({
	id: "starter-monthly",
	items: [
		items.monthlyPrice({ price: 10 }),
		constructFeatureItem({ featureId: CREDITS, includedUsage: 25 }),
		constructPrepaidItem({
			featureId: CREDITS,
			price: 0.4,
			billingUnits: 1,
			isOneOff: true,
		}),
	],
});

const scale1Monthly = products.base({
	id: "scale-1-monthly",
	items: [
		items.monthlyPrice({ price: 66 }),
		constructFeatureItem({ featureId: CREDITS, includedUsage: 300 }),
	],
});

const scaleTopUp = products.oneOffAddOn({
	id: "scale-top-up",
	items: [volumeRefillItem()],
});

const scaleTopUpGraduated = products.oneOffAddOn({
	id: "scale-top-up-graduated",
	items: [graduatedRefillItem()],
});

const scaleMonthly = products.base({
	id: "scale-monthly",
	items: [
		constructPrepaidItem({
			featureId: CREDITS,
			tiers: SCALE_MONTHLY_TIERS,
			tierBehaviour: TierBehavior.VolumeBased,
			billingUnits: 1,
			interval: ProductItemInterval.Month,
		}),
		volumeRefillItem(),
	],
});

const STARTER = "bloom-starter";
const SCALE_VOLUME = "bloom-scale-volume";
const SCALE_GRADUATED = "bloom-scale-graduated";
const SCALE_SAME_PLAN = "bloom-scale-same-plan";

const credits = (quantity: number) => [{ feature_id: CREDITS, quantity }];

const seed = async () => {
	if (!process.argv.includes("--no-clear")) await clearMasterOrg();

	const ctx = await createTestContext();

	const { autumnV2_3 } = await initScenario({
		ctx,
		customerId: STARTER,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([
				{ id: SCALE_VOLUME, paymentMethod: "success" },
				{ id: SCALE_GRADUATED, paymentMethod: "success" },
				{ id: SCALE_SAME_PLAN, paymentMethod: "success" },
			]),
			s.products({
				list: [
					starterMonthly,
					scale1Monthly,
					scaleTopUp,
					scaleTopUpGraduated,
					scaleMonthly,
				],
				prefix: PREFIX,
			}),
		],
		actions: [
			s.billing.attach({
				productId: starterMonthly.id,
				options: credits(0),
			}),

			s.billing.attach({
				customerId: SCALE_VOLUME,
				productId: scale1Monthly.id,
			}),
			s.billing.attach({
				customerId: SCALE_VOLUME,
				productId: scaleTopUp.id,
				options: credits(0),
			}),

			s.billing.attach({
				customerId: SCALE_GRADUATED,
				productId: scale1Monthly.id,
			}),
			s.billing.attach({
				customerId: SCALE_GRADUATED,
				productId: scaleTopUpGraduated.id,
				options: credits(0),
			}),

			s.billing.attach({
				customerId: SCALE_SAME_PLAN,
				productId: scaleMonthly.id,
				options: credits(500),
			}),
		],
	});

	const scenarios = [
		{ customerId: STARTER, threshold: 5, quantity: 10, drain: 18 },
		{ customerId: SCALE_VOLUME, threshold: 50, quantity: 125, drain: 240 },
		{ customerId: SCALE_GRADUATED, threshold: 50, quantity: 250, drain: 240 },
		{ customerId: SCALE_SAME_PLAN, threshold: 50, quantity: 125, drain: 440 },
	];
	for (const { customerId, threshold, quantity, drain } of scenarios) {
		await autumnV2_3.customers.update(customerId, {
			billing_controls: autoTopup({ threshold, quantity }),
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: CREDITS,
			value: drain,
		});
	}

	console.log(chalk.green("\nSeeded customers:\n"));
	for (const { customerId } of scenarios) {
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const balance = customer.balances[CREDITS];
		const control = customer.billing_controls?.auto_topups?.[0];
		console.log(
			`  ${chalk.cyan(customerId.padEnd(24))} credits remaining ${String(balance?.remaining).padStart(4)}` +
				`  auto top-up: threshold ${control?.threshold} / refill ${control?.quantity}`,
		);
	}
	console.log(
		chalk.gray(
			"\nTrack a few credits on any customer to drop below its threshold and fire the refill.\n",
		),
	);
};

seed()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(chalk.red("Seed failed:"), error);
		process.exit(1);
	});
