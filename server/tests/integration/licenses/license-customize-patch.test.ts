import { expect, test } from "bun:test";
import { ErrCode, planLicenses } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, isNotNull } from "drizzle-orm";
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
	`${chalk.yellowBright("licenses-patch: add_licenses overrides one inherited license and keeps the rest")}`,
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
				add_licenses: [{ license_plan_id: licenseA.id, included: 5 }],
			},
		});

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(2);
		expect(
			pools.find((pool) => pool.license_plan_id === licenseA.id)?.inventory,
		).toMatchObject({ included: 5, assigned: 0, available: 5 });
		expect(
			pools.find((pool) => pool.license_plan_id === licenseB.id)?.inventory,
		).toMatchObject({ included: 1, assigned: 0, available: 1 });
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-patch: remove_licenses tombstones an inherited license")}`,
	async () => {
		const { customerId, entities, autumnV2_2, parent, licenses } =
			await setupCatalogParent({
				customerId: "lic-patch-remove",
				idPrefix: "lic-patch-remove",
				catalog: [
					{ licenseSuffix: "seat-a", included: 2 },
					{ licenseSuffix: "seat-b", included: 1 },
				],
			});
		const [licenseA, licenseB] = licenses;

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			customize: { remove_licenses: [licenseA.id] },
		});

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(1);
		expect(pools[0]).toMatchObject({
			license_plan_id: licenseB.id,
			inventory: { included: 1, assigned: 0, available: 1 },
		});
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[0].id,
					plan_id: licenseA.id,
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-patch: bare add_licenses entry restores an overridden license to inheritance")}`,
	async () => {
		const { customerId, autumnV2_2, ctx, parent, licenses } =
			await setupCatalogParent({
				customerId: "lic-patch-restore",
				idPrefix: "lic-patch-restore",
				catalog: [{ licenseSuffix: "seat", included: 2 }],
			});
		const [license] = licenses;

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				add_licenses: [{ license_plan_id: license.id, included: 5 }],
			},
		});
		const overriddenPools = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
		});
		expect(overriddenPools[0]?.inventory).toMatchObject({ included: 5 });

		await autumnV2_2.billing.update({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				add_licenses: [{ license_plan_id: license.id }],
			},
		});

		const restoredPools = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
		});
		expect(restoredPools[0]?.inventory).toMatchObject({
			included: 2,
			assigned: 0,
			available: 2,
		});

		const overrideRows = await ctx.db.query.planLicenses.findMany({
			where: and(
				eq(planLicenses.license_internal_product_id, license.internal_id!),
				isNotNull(planLicenses.parent_customer_product_id),
			),
		});
		expect(overrideRows).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-patch: same license in add_licenses and remove_licenses rejects")}`,
	async () => {
		const { customerId, autumnV2_2, parent, licenses } =
			await setupCatalogParent({
				customerId: "lic-patch-overlap",
				idPrefix: "lic-patch-overlap",
				catalog: [{ licenseSuffix: "seat", included: 1 }],
			});
		const [license] = licenses;

		await expectAutumnError({
			errMessage: "cannot appear in both add_licenses and remove_licenses",
			func: () =>
				autumnV2_2.billing.attach({
					customer_id: customerId,
					plan_id: parent.id,
					customize: {
						add_licenses: [{ license_plan_id: license.id, included: 2 }],
						remove_licenses: [license.id],
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-patch: remove of a license outside the plan rejects")}`,
	async () => {
		const parent = makeParentProduct("lic-patch-unknown-parent");
		const linked = makeLicenseProduct("lic-patch-unknown-seat");
		const unlinked = makeLicenseProduct("lic-patch-unknown-unlinked");
		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "lic-patch-unknown",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, linked, unlinked] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: linked.id,
					included: 1,
				}),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "cannot be removed",
			func: () =>
				autumnV2_2.billing.attach({
					customer_id: customerId,
					plan_id: parent.id,
					customize: { remove_licenses: [unlinked.id] },
				}),
		});
	},
);
