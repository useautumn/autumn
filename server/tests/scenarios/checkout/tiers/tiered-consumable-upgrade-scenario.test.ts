import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const CONSUMABLE_TIERS = [
	{ to: 500, amount: 0.1 },
	{ to: "inf" as const, amount: 0.05 },
];

test(
	`${chalk.yellowBright("tiers: tiered consumable (graduated) upgrade - starter → pro with overage tiers")}`,
	async () => {
		const customerId = "tiers-tiered-consumable-upgrade";

		const starter = products.base({
			id: "starter",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 200 }),
				items.monthlyPrice({ price: 19 }),
			],
		});

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

		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			redirect_mode: "always",
		});
		console.log("tiered consumable upgrade preview:", upgradePreview);

		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			redirect_mode: "always",
		});
		console.log("tiered consumable upgrade result:", upgradeResult);
	},
);
