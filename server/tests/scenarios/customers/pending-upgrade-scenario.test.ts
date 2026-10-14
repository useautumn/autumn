import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const PLAN_GROUP = "upgrade-test";

const pro = products.base({
	id: "upgrade-pro",
	group: PLAN_GROUP,
	items: [
		items.monthlyMessages({ includedUsage: 100 }),
		items.monthlyPrice({ price: 20 }),
	],
});

const premium = products.base({
	id: "upgrade-premium",
	group: PLAN_GROUP,
	items: [
		items.monthlyMessages({ includedUsage: 500 }),
		items.monthlyPrice({ price: 80 }),
	],
});

test(
	`${chalk.yellowBright("scenario: paid plan with a pending upgrade awaiting payment")}`,
	async () => {
		await initScenario({
			customerId: "seed-pending-upgrade",
			setup: [
				s.deleteCustomer({ customerId: "seed-pending-upgrade" }),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					name: "Priya Raghunathan",
				}),
				s.products({ list: [pro, premium], prefix: "upgrade" }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "fail" }),
				s.billing.attach({
					productId: premium.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});
	},
	{ timeout: 300_000 },
);
