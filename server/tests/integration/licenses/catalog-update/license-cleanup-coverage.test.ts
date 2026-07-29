import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listLicenseLinks } from "../licenseTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("licenses catalog: list_links returns every link with its included quantity")}`,
	async () => {
		const parent = products.base({
			id: "list-links-parent",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const seatLicense = products.base({
			id: "list-links-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const supportLicense = products.base({
			id: "list-links-support",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-list-links-mix",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, seatLicense, supportLicense] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seatLicense.id,
					included: 2,
				}),
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: supportLicense.id,
					included: 3,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const list = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(list).toHaveLength(2);

		const seat = list.find((row) => row.license_plan_id === seatLicense.id);
		const support = list.find(
			(row) => row.license_plan_id === supportLicense.id,
		);

		expect(seat).toMatchObject({ included: 2 });
		expect(support).toMatchObject({ included: 3 });
	},
);
