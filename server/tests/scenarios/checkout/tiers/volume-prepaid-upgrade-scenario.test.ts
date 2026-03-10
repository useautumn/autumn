import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Volume Prepaid Upgrade Scenario
 *
 * Tests upgrading from a flat-prepaid starter plan to a volume-based tiered
 * prepaid pro plan. Unlike graduated pricing, volume pricing charges the
 * ENTIRE purchased quantity at the rate of whichever single tier it falls into.
 *
 * Tiers (billingUnits = 100):
 *   Tier 1: 0–500 units  @ $10/pack
 *   Tier 2: 501+ units   @ $5/pack
 *
 * Upgrade quantity: 800 units = 8 packs → falls into tier 2
 *   Volume:    8 packs × $5 = $40
 *   Graduated: 5×$10 + 3×$5 = $65  (different — volume is cheaper here)
 */

const BILLING_UNITS = 100;
const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test(
	`${chalk.yellowBright("tiers: volume prepaid upgrade - starter → pro with 800 messages (tier 2 rate)")}`,
	async () => {
		const customerId = "tiers-volume-prepaid-upgrade";

		// Starter: simple monthly plan
		const starter = products.base({
			id: "starter",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 19 }),
			],
		});

		// Pro: volume-based tiered prepaid messages ($49/mo)
		// 8 packs at 800 units → all charged at tier-2 rate ($5/pack) = $40
		const pro = products.base({
			id: "pro",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.volumePrepaidMessages({
					includedUsage: 0,
					billingUnits: BILLING_UNITS,
					tiers: VOLUME_TIERS,
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
			{ feature_id: TestFeature.Messages, quantity: 800 },
		];

		// 1. Preview upgrade - volume: 8 packs all at $5 = $40 (not $65 graduated)
		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume prepaid upgrade preview:", upgradePreview);

		// 2. Perform the upgrade
		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume prepaid upgrade result:", upgradeResult);
	},
);
