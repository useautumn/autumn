import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Ten planless customers for manual testing, five of them carrying entities.
 *
 * Names come from a fixed list rather than a random generator so every run
 * seeds the same customers, and re-running the scenario overwrites them in
 * place instead of piling up new ones.
 */
const SEED_CUSTOMERS = [
	{ id: "seed-ava-mitchell", name: "Ava Mitchell", entityCount: 0 },
	{ id: "seed-noah-bennett", name: "Noah Bennett", entityCount: 3 },
	{ id: "seed-mia-carrington", name: "Mia Carrington", entityCount: 0 },
	{ id: "seed-liam-okafor", name: "Liam Okafor", entityCount: 1 },
	{ id: "seed-zoe-hartley", name: "Zoe Hartley", entityCount: 0 },
	{ id: "seed-ethan-vasquez", name: "Ethan Vasquez", entityCount: 5 },
	{ id: "seed-iris-nakamura", name: "Iris Nakamura", entityCount: 0 },
	{ id: "seed-owen-delgado", name: "Owen Delgado", entityCount: 2 },
	{ id: "seed-freya-lindqvist", name: "Freya Lindqvist", entityCount: 0 },
	{ id: "seed-caleb-osei", name: "Caleb Osei", entityCount: 4 },
] as const;

const seedProduct = products.pro({
	id: "seed-pro",
	items: [
		items.monthlyMessages({ includedUsage: 100 }),
		items.prepaidUsers({ includedUsage: 0 }),
	],
});

test(
	`${chalk.yellowBright("scenario: planless customers, some with entities")}`,
	async () => {
		for (const seedCustomer of SEED_CUSTOMERS) {
			await initScenario({
				customerId: seedCustomer.id,
				setup: [
					s.deleteCustomer({ customerId: seedCustomer.id }),
					s.customer({ testClock: false, name: seedCustomer.name }),
					s.products({ list: [seedProduct], prefix: "seed" }),
					...(seedCustomer.entityCount > 0
						? [
								s.entities({
									count: seedCustomer.entityCount,
									featureId: TestFeature.Users,
								}),
							]
						: []),
				],
				actions: [],
			});
		}
	},
	{ timeout: 600_000 },
);
