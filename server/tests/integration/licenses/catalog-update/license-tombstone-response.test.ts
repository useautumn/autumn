import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listLicensePools } from "../licenseTestUtils.js";

const makeLicenseProduct = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

test.concurrent(
	`${chalk.yellowBright("licenses-bug: B2 included:0 tombstone shows in plans.get but is omitted from licenses.list")}`,
	async () => {
		const parent = products.base({
			id: "bug-tombstone-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("bug-tombstone-license");

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "license-bug-tombstone",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 3,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: license.id,
					included: 0,
				},
			],
		});

		const plan = (await autumnV2_2.post("/plans.get", {
			plan_id: parent.id,
		})) as {
			id: string;
			licenses?: Array<{ license_plan_id: string; included: number }>;
		};
		const tombstoneLink = plan.licenses?.find(
			(link) => link.license_plan_id === license.id,
		);
		expect(tombstoneLink).toMatchObject({
			license_plan_id: license.id,
			included: 0,
		});

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools.some((pool) => pool.license_plan_id === license.id)).toBe(
			false,
		);
	},
);
