import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Tiered Consumable Upgrade Scenario (Graduated Overage Pricing)
 *
 * Tests upgrading from a simple monthly plan to a plan with graduated tiered
 * consumable (pay-per-use overage) messages. Overage is billed in arrears at
 * the end of the billing cycle at graduated tier rates.
 *
 * Overage tiers:
 *   Tier 1: 0–500 units  @ $0.10/unit
 *   Tier 2: 501+ units   @ $0.05/unit
 *
 * The upgrade preview shows no overage charge (billed in arrears), but the
 * plan line item and feature configuration should reflect tiered overage pricing.
 */

const CONSUMABLE_TIERS = [
	{ to: 500, amount: 0.1 },
	{ to: "inf" as const, amount: 0.05 },
];

test(
	`${chalk.yellowBright("tiers: tiered consumable (graduated) upgrade - starter → pro with overage tiers")}`,
	async () => {
		const customerId = "tiers-tiered-consumable-upgrade";

		// Starter: flat monthly messages, $19/mo
		const starter = products.base({
			id: "starter",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 200 }),
				items.monthlyPrice({ price: 19 }),
			],
		});

		// Pro: higher included messages + graduated tiered consumable overage ($49/mo)
		const pro = products.base({
			id: "pro",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.monthlyMessages({ includedUsage: 500 }),
				items.tieredConsumableMessages({
					includedUsage: 0,
					tiers: CONSUMABLE_TIERS,
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

		// 1. Preview upgrade - consumable overage is billed in arrears, no upfront charge
		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			redirect_mode: "always",
		});
		console.log("tiered consumable upgrade preview:", upgradePreview);

		// 2. Perform the upgrade
		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			redirect_mode: "always",
		});
		console.log("tiered consumable upgrade result:", upgradeResult);
	},
);
