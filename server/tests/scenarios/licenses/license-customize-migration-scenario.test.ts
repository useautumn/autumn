import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Customer "license-customize-migration" for testing a migration that adds a
 * free boolean entitlement to a license link:
 *
 *   customize-parent with one linked license:
 *     dev-seat-license (included: 1, $20/mo per extra seat, 500 messages)
 *     3 seats attached (1 included + 2 paid) → assigned to entity 0 and 1
 *   entity 2 has no assignment, so it stays a control.
 *
 * Neither plan carries `dashboard`, so a migration adding it to the license
 * customize is unambiguously the source if it appears on an assignment:
 *
 *   customize: { upsert_licenses: [{ license_plan_id: "dev-seat-license",
 *     customize: { add_items: [{ feature_id: "dashboard" }] } }] }
 */
test(`${chalk.yellowBright("scenario: license link ready for a customize migration")}`, async () => {
	const parent = products.pro({
		id: "customize-parent",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});
	const devSeatLicense = products.base({
		id: "dev-seat-license",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

	await initScenario({
		customerId: "license-customize-migration",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
			s.products({ list: [parent, devSeatLicense] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeatLicense.id,
				included: 1,
			}),
			s.billing.attach({
				productId: parent.id,
				licenseQuantities: [
					{ licenseProductId: devSeatLicense.id, quantity: 3 },
				],
			}),
			s.licenses.assign({
				licenseProductId: devSeatLicense.id,
				entityIndex: 0,
			}),
			s.licenses.assign({
				licenseProductId: devSeatLicense.id,
				entityIndex: 1,
			}),
		],
	});
});
