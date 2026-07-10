/**
 * TDD test for plan-version migrations vs customized license sets.
 *
 * Red-failure mode (current behavior):
 *  - Migration only skips is_custom cusProducts. A customer with a customized
 *    license set (license_set_customized) is migrated onto a fresh cusProduct
 *    whose pools are rebuilt from the plan's inherited links — silently
 *    reverting their customization and re-parenting assignments over capacity.
 *
 * Green-success criteria (after fix):
 *  - Customized-license customers are excluded from migration (mirroring the
 *    is_custom exclusion); their custom pools and assignments stay intact.
 *  - Customers with inherited license sets still migrate, with assignments
 *    re-parented onto the new version's pools.
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	CheckResponseV3,
	LicenseBalanceResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getMigrationCustomers } from "@/internal/migrations/migrationSteps/getMigrationCustomers.js";
import { migrateCustomer } from "@/internal/migrations/migrationSteps/migrateCustomer.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getLicenseDbState } from "./licenseTestUtils.js";

const expectUnsafeMigrationRejected = async ({
	customerId,
	targetIncluded,
}: {
	customerId: string;
	targetIncluded?: number;
}) => {
	const source = products.base({
		id: `${customerId}-source`,
		items: [items.dashboard()],
	});
	const target = products.base({
		id: `${customerId}-target`,
		items: [items.dashboard()],
	});
	const license = products.base({
		id: `${customerId}-license`,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});
	const entityCount = targetIncluded === undefined ? 1 : targetIncluded + 1;
	const { entities, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
			s.products({ list: [source, target, license] }),
		],
		actions: [s.billing.attach({ productId: source.id })],
	});
	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: source.id,
		license_plan_id: license.id,
		included: entityCount,
	});
	if (targetIncluded !== undefined) {
		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: target.id,
			license_plan_id: license.id,
			included: targetIncluded,
		});
	}
	for (const entity of entities) {
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entity.id,
			plan_id: license.id,
		});
	}
	const [sourceProduct, targetProduct] = await Promise.all(
		[source, target].map((product) =>
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: product.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		),
	);
	const before = await getLicenseDbState({ db: ctx.db, customerId });

	expect(
		await migrateCustomer({
			ctx,
			customerId,
			fromProduct: sourceProduct,
			toProduct: targetProduct,
		}),
	).toBe(false);

	const after = await getLicenseDbState({ db: ctx.db, customerId });
	expect(
		after.assignments.map(
			({ id, status, license_parent_customer_product_id }) => ({
				id,
				status,
				parentId: license_parent_customer_product_id,
			}),
		),
	).toEqual(
		before.assignments.map(
			({ id, status, license_parent_customer_product_id }) => ({
				id,
				status,
				parentId: license_parent_customer_product_id,
			}),
		),
	);
	expect(
		after.pools.map(
			({ id, parent_customer_product_id, granted, remaining }) => ({
				id,
				parentId: parent_customer_product_id,
				granted,
				remaining,
			}),
		),
	).toEqual(
		before.pools.map(
			({ id, parent_customer_product_id, granted, remaining }) => ({
				id,
				parentId: parent_customer_product_id,
				granted,
				remaining,
			}),
		),
	);
};

test.concurrent(
	`${chalk.yellowBright("licenses migration: target missing an assigned license rejects atomically")}`,
	() =>
		expectUnsafeMigrationRejected({
			customerId: "lic-mig-missing-license",
		}),
);

test.concurrent(
	`${chalk.yellowBright("licenses migration: target capacity below assignments rejects atomically")}`,
	() =>
		expectUnsafeMigrationRejected({
			customerId: "lic-mig-low-capacity",
			targetIncluded: 1,
		}),
);

test.concurrent(
	`${chalk.yellowBright("licenses migration: inherited assignments move to the new version exactly once")}`,
	async () => {
		const parent = products.base({
			id: "lic-mig-inherited-parent",
			items: [items.dashboard()],
		});
		const messageLicense = products.base({
			id: "lic-mig-message-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const wordLicense = products.base({
			id: "lic-mig-word-seat",
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "lic-mig-inherited",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [parent, messageLicense, wordLicense] }),
				],
				actions: [],
			});

		for (const license of [messageLicense, wordLicense]) {
			await autumnV2_2.post("/licenses.link", {
				parent_plan_id: parent.id,
				license_plan_id: license.id,
				included: 2,
			});
		}
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
		});
		const assignmentIds = await Promise.all(
			[messageLicense, wordLicense].map(async (license, index) => {
				const result = (await autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[index].id,
					plan_id: license.id,
				})) as { assignment: { id: string } };
				return result.assignment.id;
			}),
		);

		const parentV1 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		await autumnV1.products.update(parent.id, {
			items: [items.dashboard(), items.monthlyCredits({ includedUsage: 100 })],
		});
		const parentV2 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(
			await migrateCustomer({
				ctx,
				customerId,
				fromProduct: parentV1,
				toProduct: parentV2,
			}),
		).toBe(true);

		const assertMigratedState = async () => {
			const customer = await autumnV1.customers.get<{
				products: { id: string; version?: number }[];
			}>(customerId);
			const activeParents = customer.products.filter(
				(product) => product.id === parent.id,
			);
			expect(activeParents).toHaveLength(1);
			expect(activeParents[0].version).toBe(2);

			const dbState = await getLicenseDbState({ db: ctx.db, customerId });
			const activeParent = dbState.products.filter(
				(customerProduct) =>
					customerProduct.product_id === parent.id &&
					customerProduct.status === "active" &&
					customerProduct.license_parent_customer_product_id === null,
			);
			expect(activeParent).toHaveLength(1);
			expect(
				dbState.assignments
					.filter(({ status }) => status === "active")
					.map(({ id, license_parent_customer_product_id }) => ({
						id,
						parentId: license_parent_customer_product_id,
					}))
					.sort((a, b) => a.id.localeCompare(b.id)),
			).toEqual(
				assignmentIds
					.map((id) => ({ id, parentId: activeParent[0].id }))
					.sort((a, b) => a.id.localeCompare(b.id)),
			);
			expect(dbState.pools).toHaveLength(2);
			for (const pool of dbState.pools) {
				expect(pool).toMatchObject({
					parent_customer_product_id: activeParent[0].id,
					granted: 2,
					remaining: 1,
				});
			}

			const pools = (await autumnV2_2.post("/licenses.list", {
				customer_id: customerId,
			})) as { list: LicenseBalanceResponse[] };
			expect(pools.list).toHaveLength(2);
			for (const [index, license] of [messageLicense, wordLicense].entries()) {
				const pool = pools.list.find(
					(candidate) => candidate.license_plan_id === license.id,
				);
				expect(pool).toMatchObject({
					parent_plan_id: parent.id,
					inventory: { included: 2, assigned: 1, available: 1 },
				});
				expect(
					pool?.assignments.map((assignment) => assignment.assignment_id),
				).toEqual([assignmentIds[index]]);
			}

			for (const [index, featureId] of [
				TestFeature.Messages,
				TestFeature.Words,
			].entries()) {
				const check = await autumnV2_2.check<CheckResponseV3>({
					customer_id: customerId,
					entity_id: entities[index].id,
					feature_id: featureId,
					skip_cache: true,
				});
				expect(check.allowed).toBe(true);
			}
		};

		await assertMigratedState();
		expect(
			await migrateCustomer({
				ctx,
				customerId,
				fromProduct: parentV1,
				toProduct: parentV2,
			}),
		).toBe(true);
		await assertMigratedState();
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses migration: customized license set is not reverted by version migration")}`,
	async () => {
		const parent = products.base({
			id: "lic-mig-custom-parent",
			items: [items.dashboard()],
		});
		const license = {
			...products.base({
				id: "lic-mig-custom-seat",
				items: [items.monthlyMessages({ includedUsage: 25 })],
			}),
		};

		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "lic-mig-customized",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [parent, license] }),
				],
				actions: [],
			});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				add_licenses: [
					{
						license_plan_id: license.id,
						included: 3,
					},
				],
			},
		});

		for (const entity of entities) {
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entity.id,
				plan_id: license.id,
			});
		}

		const poolsBefore = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsBefore.list).toHaveLength(1);
		expect(poolsBefore.list[0].inventory).toMatchObject({
			included: 3,
			assigned: 2,
		});

		const parentV1 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		await autumnV1.products.update(parent.id, {
			items: [items.dashboard(), items.monthlyWords({ includedUsage: 100 })],
		});
		const migrationCustomers = await getMigrationCustomers({
			db: ctx.db,
			fromProduct: parentV1,
		});
		expect(migrationCustomers.map((customer) => customer.id)).not.toContain(
			customerId,
		);

		const migratedCustomer = await autumnV1.customers.get<{
			products: { id: string; version?: number }[];
		}>(customerId);
		// Customized license parents are deliberately skipped by migration —
		// the customer keeps v1 with its customization intact.
		const parentVersions = migratedCustomer.products
			.filter((product) => product.id === parent.id)
			.map((product) => product.version);
		expect(parentVersions).toContain(1);
		expect(parentVersions).not.toContain(2);

		const poolsAfter = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsAfter.list).toHaveLength(1);
		expect(poolsAfter.list[0].inventory).toMatchObject({
			included: 3,
			assigned: 2,
		});
	},
);
