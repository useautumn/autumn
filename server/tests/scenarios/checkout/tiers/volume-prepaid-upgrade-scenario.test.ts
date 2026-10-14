import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test(
	`${chalk.yellowBright("tiers: volume prepaid upgrade - starter → pro with 800 messages (tier 2 rate)")}`,
	async () => {
		const customerId = "tiers-volume-prepaid-upgrade";

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

		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume prepaid upgrade preview:", upgradePreview);

		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: messagesOptions,
			redirect_mode: "always",
		});
		console.log("volume prepaid upgrade result:", upgradeResult);
	},
);
