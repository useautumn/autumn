import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(
	`${chalk.yellowBright("tiers: allocated seats upgrade - starter → pro with 5 allocated seats")}`,
	async () => {
		const customerId = "tiers-allocated-upgrade";

		const starter = products.base({
			id: "starter",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 19 }),
			],
		});

		const pro = products.pro({
			id: "pro",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.monthlyMessages({ includedUsage: 500 }),
				items.allocatedUsers({ includedUsage: 0 }),
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

		const seatsOptions = [{ feature_id: TestFeature.Users, quantity: 5 }];

		const upgradePreview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: seatsOptions,
			redirect_mode: "always",
		});
		console.log("allocated upgrade preview:", upgradePreview);

		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			options: seatsOptions,
			redirect_mode: "always",
		});
		console.log("allocated upgrade result:", upgradeResult);
	},
);
