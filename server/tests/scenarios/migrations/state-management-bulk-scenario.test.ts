import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const CUSTOMER_COUNT = 100;
const ATTACH_BATCH_SIZE = 10;

/**
 * QA setup for migration progress at volume.
 *
 *   plan qa-bulk        100 messages
 *   qa-bulk-000..099    plain on the bulk plan
 *   qa-bulk (draft)     add dashboard to the bulk plan; never run, so Run All
 *                       shows the progress footer over 100 customers
 */
test(`${chalk.yellowBright("migration-setup: state management bulk QA")}`, async () => {
	const bulk = products.base({
		id: "bulk",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const customerIds = Array.from(
		{ length: CUSTOMER_COUNT },
		(_, index) => `qa-bulk-${String(index).padStart(3, "0")}`,
	);
	const [firstCustomerId, ...otherCustomerIds] = customerIds;
	const attachBatches = Array.from(
		{ length: Math.ceil(CUSTOMER_COUNT / ATTACH_BATCH_SIZE) },
		(_, batch) =>
			customerIds.slice(
				batch * ATTACH_BATCH_SIZE,
				(batch + 1) * ATTACH_BATCH_SIZE,
			),
	);

	const { autumnV2_2 } = await initScenario({
		customerId: firstCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers(otherCustomerIds.map((id) => ({ id }))),
			s.products({ list: [bulk], prefix: "qa" }),
		],
		actions: attachBatches.map((ids) =>
			s.parallel(
				...ids.map((customerId) =>
					s.billing.attach({ customerId, productId: bulk.id }),
				),
			),
		),
	});

	await autumnV2_2.migrationsV2.deleteAndCreate({
		id: "qa-bulk",
		filter: { customer: { plan: { plan_id: bulk.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: bulk.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
		no_billing_changes: true,
	});

	console.log(
		chalk.green(
			`[migration-setup] qa-bulk (Draft) over ${CUSTOMER_COUNT} customers on ${bulk.id}. Run All to watch progress.`,
		),
	);
});
