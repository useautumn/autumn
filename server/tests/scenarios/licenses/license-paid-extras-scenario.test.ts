import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("scenario: license pool with included + paid extra seats")}`, async () => {
	const parent = products.pro({
		id: "paid-extras-parent",
		items: [items.dashboard()],
	});
	const seatLicense = products.base({
		id: "paid-extras-seat",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 25 }),
		],
	});

	await initScenario({
		customerId: "license-paid-extras",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 4, featureId: TestFeature.Users }),
			s.products({ list: [parent, seatLicense] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seatLicense.id,
				included: 3,
			}),
			s.billing.attach({
				productId: parent.id,
				licenseQuantities: [{ licenseProductId: seatLicense.id, quantity: 5 }],
			}),
			s.licenses.assign({
				licenseProductId: seatLicense.id,
				entityIndexes: [0, 1],
			}),
		],
	});
});
