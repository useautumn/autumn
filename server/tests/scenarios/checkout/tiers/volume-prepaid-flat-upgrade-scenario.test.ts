import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Volume Prepaid with Flat Amount Upgrade Scenario
 *
 * Tests upgrading from a simple plan to a volume-prepaid plan that combines
 * a per-unit amount AND a flat fee per tier. The flat_amount is charged once
 * for whichever tier the total quantity falls into.
 *
 * Tiers (billingUnits = 1, quantity maps directly to units):
 *   Tier 1: 0–100  → $1.00/unit + $10 flat fee
 *   Tier 2: 101+   → $0.50/unit + $25 flat fee
 *
 * Upgrade scenarios tested:
 *   50 units → tier 1 → (50 × $1.00) + $10 = $60
 *   150 units → tier 2 → (150 × $0.50) + $25 = $100
 */

const FLAT_TIERS = [
	{ to: 100, amount: 1, flat_amount: 10 },
	{ to: "inf" as const, amount: 0.5, flat_amount: 25 },
];

test(
	`${chalk.yellowBright("tiers: volume prepaid + flat amount upgrade - starter → pro (50 units, tier 1 → $60)")}`,
	async () => {
		const customerId = "tiers-vol-flat-tier1-upgrade";

		// Starter: simple monthly plan
		const starter = products.base({
			id: "starter",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 19 }),
			],
		});

		// Pro: volume prepaid with flat_amount tiers (billingUnits=1)
		// 50 units → tier 1 → 50×$1 + $10 flat = $60
		const pro = products.base({
			id: "pro",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.volumePrepaidMessages({
					includedUsage: 0,
					billingUnits: 1,
					tiers: FLAT_TIERS,
				}),
				items.monthlyPrice({ price: 49 }),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, pro] }),
			],
			actions: [s.attach({ productId: "starter" })],
		});

		const messagesOptions = [
			{ feature_id: TestFeature.Messages, quantity: 50 },
		];

		// 1. Preview upgrade - volume + flat: 50×$1 + $10 = $60
		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume+flat upgrade preview (tier 1):", upgradePreview);

		// 2. Perform the upgrade
		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume+flat upgrade result (tier 1):", upgradeResult);
	},
);

test(
	`${chalk.yellowBright("tiers: volume prepaid + flat amount upgrade - starter → pro (150 units, tier 2 → $100)")}`,
	async () => {
		const customerId = "tiers-vol-flat-tier2-upgrade";

		// Starter: simple monthly plan
		const starter = products.base({
			id: "starter",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 19 }),
			],
		});

		// Pro: volume prepaid with flat_amount tiers (billingUnits=1)
		// 150 units → tier 2 → 150×$0.50 + $25 flat = $100
		const pro = products.base({
			id: "pro",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.volumePrepaidMessages({
					includedUsage: 0,
					billingUnits: 1,
					tiers: FLAT_TIERS,
				}),
				items.monthlyPrice({ price: 49 }),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, pro] }),
			],
			actions: [s.attach({ productId: "starter" })],
		});

		const messagesOptions = [
			{ feature_id: TestFeature.Messages, quantity: 150 },
		];

		// 1. Preview upgrade - volume + flat: 150×$0.50 + $25 = $100
		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume+flat upgrade preview (tier 2):", upgradePreview);

		// 2. Perform the upgrade
		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume+flat upgrade result (tier 2):", upgradeResult);
	},
);
