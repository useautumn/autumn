import { test } from "bun:test";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

test(`${chalk.yellowBright("migrations events: basic free-plan boolean feature migration")}`, async () => {
	const suffix = Date.now();
	const firstCustomerId = `migration-events-free-first-${suffix}`;
	const secondCustomerId = `migration-events-free-second-${suffix}`;
	const thirdCustomerId = `migration-events-free-third-${suffix}`;
	const freePlan = products.base({
		id: `migration-events-free-${suffix}`,
		items: [],
	});

	const { autumnV2_2 } = await initScenario({
		customerId: firstCustomerId,
		setup: [
			s.customer(),
			s.otherCustomers([{ id: secondCustomerId }, { id: thirdCustomerId }]),
			s.products({ list: [freePlan] }),
		],
		actions: [
			s.parallel(
				s.billing.attach({ productId: freePlan.id }),
				s.billing.attach({
					customerId: secondCustomerId,
					productId: freePlan.id,
				}),
				s.billing.attach({
					customerId: thirdCustomerId,
					productId: freePlan.id,
				}),
			),
		],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `migration-events-free-dashboard-${suffix}`,
		filter: { customer: { plan: { plan_id: freePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: freePlan.id },
					customize: {
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
	});

	const runResponse = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: false,
	});

	await timeout(10_000);

	const runs = await autumnV2_2.migrationsV2.listRuns({
		migrationId: migration.id,
	});
	const events = await autumnV2_2.migrationsV2.listItemEvents({
		migrationId: migration.id,
		migrationRunId: runResponse.run_id,
	});

	console.log("migration runs", JSON.stringify(runs, null, 2));
	console.log("migration item events", JSON.stringify(events, null, 2));
});
