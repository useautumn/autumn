import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Customer "license-scenario" for dashboard testing of license pools and
 * assignments:
 *
 *   pro parent plan with two linked licenses:
 *     seat-license  (included: 3) → assigned to entity 0 and 1, 1 seat free
 *     admin-license (included: 1) → assigned to entity 0, pool exhausted
 *   3 entities, so entity 2 has no assignments.
 */
test(`${chalk.yellowBright("scenario: customer with license pools + assignments")}`, async () => {
	const parent = products.pro({
		id: "license-parent",
		items: [items.dashboard()],
	});
	const seatLicense = products.base({
		id: "seat-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});
	const adminLicense = products.base({
		id: "admin-license",
		items: [items.adminRights()],
	});

	await initScenario({
		customerId: "license-scenario",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
			s.products({ list: [parent, seatLicense, adminLicense] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seatLicense.id,
				included: 3,
			}),
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: adminLicense.id,
				included: 1,
			}),
			s.billing.attach({ productId: parent.id }),
			s.licenses.assign({
				licenseProductId: seatLicense.id,
				entityIndex: 0,
			}),
			s.licenses.assign({
				licenseProductId: seatLicense.id,
				entityIndex: 1,
			}),
			s.licenses.assign({
				licenseProductId: adminLicense.id,
				entityIndex: 0,
			}),
		],
	});
});
