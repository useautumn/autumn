import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const FLAT_TIERS = [
	{ to: 100, amount: 1, flat_amount: 10 },
	{ to: "inf" as const, amount: 0.5, flat_amount: 25 },
];

test(
	`${chalk.yellowBright("tiers: volume prepaid + flat amount upgrade - starter → pro (50 units, tier 1 → $60)")}`,
	async () => {
		const customerId = "tiers-vol-flat-tier1-upgrade";

		const starter = products.base({
			id: "starter",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 19 }),
			],
		});

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

		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume+flat upgrade preview (tier 1):", upgradePreview);

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

		const starter = products.base({
			id: "starter",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 19 }),
			],
		});

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

		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume+flat upgrade preview (tier 2):", upgradePreview);

		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume+flat upgrade result (tier 2):", upgradeResult);
	},
);
