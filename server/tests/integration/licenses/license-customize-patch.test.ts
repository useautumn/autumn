import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listLicensePools } from "./licenseTestUtils.js";

const makeParentProduct = (id: string) =>
	products.base({ id, items: [items.dashboard()] });

const makeLicenseProduct = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

const setupCatalogParent = async ({
	customerId,
	idPrefix,
	catalog,
}: {
	customerId: string;
	idPrefix: string;
	catalog: { licenseSuffix: string; included: number }[];
}) => {
	const parent = makeParentProduct(`${idPrefix}-parent`);
	const licenses = catalog.map(({ licenseSuffix }) =>
		makeLicenseProduct(`${idPrefix}-${licenseSuffix}`),
	);

	const result = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, ...licenses] }),
		],
		actions: catalog.map(({ included }, index) =>
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: licenses[index].id,
				included,
			}),
		),
	});

	return { ...result, parent, licenses };
};

test.concurrent(
	`${chalk.yellowBright("licenses-patch: upsert_licenses overrides one inherited license and keeps the rest")}`,
	async () => {
		const { customerId, autumnV2_2, parent, licenses } =
			await setupCatalogParent({
				customerId: "lic-patch-add-keeps",
				idPrefix: "lic-patch-add-keeps",
				catalog: [
					{ licenseSuffix: "seat-a", included: 2 },
					{ licenseSuffix: "seat-b", included: 1 },
				],
			});
		const [licenseA, licenseB] = licenses;

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [{ license_plan_id: licenseA.id, included: 5 }],
			},
		});

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(2);
		expect(
			pools.find((pool) => pool.license_plan_id === licenseA.id),
		).toMatchObject({ granted: 5, usage: 0, remaining: 5 });
		expect(
			pools.find((pool) => pool.license_plan_id === licenseB.id),
		).toMatchObject({ granted: 1, usage: 0, remaining: 1 });
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-patch: duplicate license in upsert_licenses rejects")}`,
	async () => {
		const { customerId, autumnV2_2, parent, licenses } =
			await setupCatalogParent({
				customerId: "lic-patch-dup-upsert",
				idPrefix: "lic-patch-dup-upsert",
				catalog: [{ licenseSuffix: "seat-a", included: 1 }],
			});
		const [license] = licenses;

		await expectAutumnError({
			errMessage: "Duplicate license",
			func: () =>
				autumnV2_2.billing.attach({
					customer_id: customerId,
					plan_id: parent.id,
					customize: {
						upsert_licenses: [
							{ license_plan_id: license.id, included: 2 },
							{ license_plan_id: license.id, included: 3 },
						],
					},
				}),
		});
	},
);
