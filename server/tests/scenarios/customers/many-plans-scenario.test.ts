import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/pollUntil";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Customer with many plans across all types, for testing the paginated
 * customer-products table at scale (multiple pages, type ordering + filter,
 * page-size changes).
 *
 *   1 subscription
 *   10 one-off products  → "One-off"
 *   10 recurring add-ons → "Add-on"
 *   10 one-off add-ons   → "Add-on"
 *   = 31 plans on customer "many-plans".
 *
 * A customer can only hold one main subscription, so add-ons (which stack)
 * make up the bulk. One-off products give the "One-off" type its own rows.
 */
const ONE_OFF_COUNT = 10;
const RECURRING_ADDON_COUNT = 10;
const ONE_OFF_ADDON_COUNT = 10;

test(`${chalk.yellowBright("scenario: customer with many plans (all types)")}`, async () => {
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

	// Short per-attach waits; the poll below waits for webhook settling once.
	const fastAttach = { timeout: 500, clientTimeout: 0 };

	const { autumnV1 } = await initScenario({
		customerId: "many-plans",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: allProducts, prefix: "mp" }),
		],
		actions: [
			s.attach({ productId: subscription.id, ...fastAttach }),
			...oneOffs.map((p) => s.attach({ productId: p.id, ...fastAttach })),
			...recurringAddOns.map((p) =>
				s.attach({
					productId: p.id,
					newBillingSubscription: true,
					...fastAttach,
				}),
			),
			...oneOffAddOns.map((p) => s.attach({ productId: p.id, ...fastAttach })),
		],
	});

	await pollUntil(
		async () => {
			const customer =
				await autumnV1.customers.get<ApiCustomerV3>("many-plans");
			return (customer.products?.length ?? 0) >= allProducts.length;
		},
		{ deadlineMs: 30_000 },
	);
});
