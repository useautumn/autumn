import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getLicenseDbState, listLicensePools } from "./licenseTestUtils.js";

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

/**
 * A customer already on a plan gains a license through an in-place update.
 *
 * Red (current):  convergePatchedCustomerLicenses only maps existing pools, so
 *                 a customer with none ends the update with none; licenses.attach
 *                 then fails with "No plan on this customer offers license".
 * Green (after):  a pool is minted with granted = included; assignment succeeds.
 */
test.concurrent(
	`${chalk.yellowBright("licenses-patch: update upsert_licenses mints a pool for a license the customer has no pool for")}`,
	async () => {
		const parent = makeParentProduct("lic-patch-new-pool-parent");
		const license = makeLicenseProduct("lic-patch-new-pool-seat");
		const { customerId, autumnV2_2, entities } = await initScenario({
			customerId: "lic-patch-new-pool",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.billing.update({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [{ license_plan_id: license.id, included: 3 }],
			},
		});

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(1);
		expect(pools[0]).toMatchObject({
			license_plan_id: license.id,
			granted: 3,
			usage: 0,
			remaining: 3,
		});

		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			plan_id: license.id,
			entities: [{ entity_id: entities[0].id }],
		});
		const afterAssign = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
		});
		expect(afterAssign[0]).toMatchObject({
			granted: 3,
			usage: 1,
			remaining: 2,
		});
	},
);

/**
 * The same update against a customer whose pool already exists (with a seat
 * assigned) must converge that pool, not replace it: link_id and the seat's
 * pointer survive, and remaining reflects the live assignment.
 */
test.concurrent(
	`${chalk.yellowBright("licenses-patch: update upsert_licenses keeps an existing pool's identity and assignments")}`,
	async () => {
		const { customerId, autumnV2_2, ctx, parent, licenses, entities } =
			await setupCatalogParent({
				customerId: "lic-patch-keep-pool",
				idPrefix: "lic-patch-keep-pool",
				catalog: [{ licenseSuffix: "seat-a", included: 2 }],
			});
		const [license] = licenses;
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			plan_id: license.id,
			entities: [{ entity_id: entities[0].id }],
		});
		const before = await getLicenseDbState({ db: ctx.db, customerId });
		expect(before.pools).toHaveLength(1);
		const [poolBefore] = before.pools;

		await autumnV2_2.billing.update({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [{ license_plan_id: license.id, included: 5 }],
			},
		});

		const after = await getLicenseDbState({ db: ctx.db, customerId });
		expect(after.pools).toHaveLength(1);
		expect(after.pools[0]).toMatchObject({
			id: poolBefore.id,
			link_id: poolBefore.link_id,
			granted: 5,
			remaining: 4,
		});
		expect(after.assignments).toHaveLength(1);
		expect(after.assignments[0].customer_license_link_id).toBe(
			poolBefore.link_id,
		);
	},
);
