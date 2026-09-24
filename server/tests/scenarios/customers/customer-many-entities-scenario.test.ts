import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * One planless customer with dozens of entities of every shape the picker has
 * to lay out: short and very long names, uuid-style ids, and nameless rows.
 */
const CUSTOMER_ID = "seed-many-entities";

const FIRST_NAMES = [
	"Ava",
	"Noah",
	"Mia",
	"Liam",
	"Zoe",
	"Ethan",
	"Iris",
	"Owen",
	"Freya",
	"Caleb",
];

const LAST_NAMES = [
	"Sanderson",
	"Thompson-Whitaker",
	"Gupta",
	"Li",
	"Venkataraghavan",
	"Okafor",
	"Lindqvist",
	"Delgado",
	"Nakamura",
	"Osei",
];

const uuidStyleId = (index: number) =>
	`aaa00000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const buildEntities = () => {
	const personEntities = FIRST_NAMES.flatMap((firstName, firstIndex) =>
		LAST_NAMES.slice(0, 3).map((lastName, lastIndex) => {
			const index = firstIndex * 3 + lastIndex + 1;
			return {
				id: uuidStyleId(index),
				name: `${firstName} ${lastName}`,
				feature_id: TestFeature.Users,
			};
		}),
	);

	const longNameEntities = [
		{
			id: "acme-docs-cs-csm-candidate-agent-2",
			name: "acme-docs-cs-csm-candidate-agent-2",
			feature_id: TestFeature.Users,
		},
		{
			id: "acme-docs-cs-csm-candidate-agent",
			name: "acme-docs-cs-csm-candidate-agent",
			feature_id: TestFeature.Users,
		},
		{
			id: "69f38e8171e4bb246d9c0a1b2c3d4e5f",
			name: "acme-docs-test-env",
			feature_id: TestFeature.Users,
		},
	];

	const namelessEntities = [1, 2, 3].map((index) => ({
		id: `nameless-${index}`,
		name: "",
		feature_id: TestFeature.Users,
	}));

	return [...longNameEntities, ...personEntities, ...namelessEntities];
};

const seedProduct = products.pro({
	id: "seed-pro",
	items: [
		items.monthlyMessages({ includedUsage: 100 }),
		items.prepaidUsers({ includedUsage: 0 }),
	],
});

test(
	`${chalk.yellowBright("scenario: customer with many entities")}`,
	async () => {
		const { autumnV1, customerId } = await initScenario({
			customerId: CUSTOMER_ID,
			setup: [
				s.deleteCustomer({ customerId: CUSTOMER_ID }),
				s.customer({ testClock: false, name: "Many Entities Co" }),
				s.products({ list: [seedProduct], prefix: "seed" }),
			],
			actions: [],
		});

		await autumnV1.entities.create(customerId, buildEntities());
	},
	{ timeout: 600_000 },
);
