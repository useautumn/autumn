import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const ONE_OFF_COUNT = 10;
const RECURRING_ADDON_COUNT = 10;
const ONE_OFF_ADDON_COUNT = 10;
const ATTACH_SETTLE_MS = 0;

test(
	`${chalk.yellowBright("scenario: customer with many plans (all types)")}`,
	async () => {
		const subscription = products.pro({
			id: "mp-sub",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const oneOffs = Array.from({ length: ONE_OFF_COUNT }, (_, i) =>
			products.oneOff({
				id: `mp-oneoff-${i + 1}`,
				items: [items.monthlyMessages({ includedUsage: 20 })],
			}),
		);

		const recurringAddOns = Array.from(
			{ length: RECURRING_ADDON_COUNT },
			(_, i) =>
				products.recurringAddOn({
					id: `mp-recurring-addon-${i + 1}`,
					items: [items.monthlyMessages({ includedUsage: 10 })],
				}),
		);

		const oneOffAddOns = Array.from({ length: ONE_OFF_ADDON_COUNT }, (_, i) =>
			products.oneOffAddOn({
				id: `mp-oneoff-addon-${i + 1}`,
				items: [items.monthlyMessages({ includedUsage: 5 })],
			}),
		);

		const allProducts = [
			subscription,
			...oneOffs,
			...recurringAddOns,
			...oneOffAddOns,
		];

		await initScenario({
			customerId: "many-plans",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: allProducts, prefix: "mp" }),
			],
			actions: [
				s.attach({ productId: subscription.id, timeout: ATTACH_SETTLE_MS }),
				...oneOffs.map((p) =>
					s.attach({ productId: p.id, timeout: ATTACH_SETTLE_MS }),
				),
				...recurringAddOns.map((p) =>
					s.attach({
						productId: p.id,
						newBillingSubscription: true,
						timeout: ATTACH_SETTLE_MS,
					}),
				),
				...oneOffAddOns.map((p) =>
					s.attach({ productId: p.id, timeout: ATTACH_SETTLE_MS }),
				),
			],
		});
	},
	{ timeout: 480_000 },
);
