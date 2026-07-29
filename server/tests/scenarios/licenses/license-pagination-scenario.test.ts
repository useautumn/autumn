import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const ENTITY_COUNT = 110;
const ASSIGNED_COUNT = 105;
const BATCH_SIZE = 35;

const assignmentBatches = Array.from(
	{ length: Math.ceil(ASSIGNED_COUNT / BATCH_SIZE) },
	(_, batch) =>
		Array.from(
			{ length: Math.min(BATCH_SIZE, ASSIGNED_COUNT - batch * BATCH_SIZE) },
			(_, i) => batch * BATCH_SIZE + i,
		),
);

/**
 * Customer "license-pagination" for dashboard testing of the license pool
 * detail sheet with a large assignment list: one seat license with 105 of 110
 * entities assigned (120 included, so 15 seats stay free).
 */
test(`${chalk.yellowBright("scenario: license pool with 100+ assigned entities")}`, async () => {
	const parent = products.pro({
		id: "license-pagination-parent",
		items: [items.dashboard()],
	});
	const seatLicense = products.base({
		id: "pagination-seat-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

	await initScenario({
		customerId: "license-pagination",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: ENTITY_COUNT, featureId: TestFeature.Users }),
			s.products({ list: [parent, seatLicense] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seatLicense.id,
				included: 120,
			}),
			s.billing.attach({ productId: parent.id }),
			...assignmentBatches.map((entityIndexes) =>
				s.licenses.assign({
					licenseProductId: seatLicense.id,
					entityIndexes,
				}),
			),
		],
	});
});
