import { expect, test } from "bun:test";
import {
	ACTIVE_STATUSES,
	type AttachParamsV1Input,
	type CheckResponseV3,
	type FullProduct,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	assignLicense,
	getLicenseDbState,
	listLicenseAssignments,
	listLicensePools,
} from "./licenseTestUtils.js";
import { expectLiveLicensePools } from "./utils/expectLiveLicensePools.js";

/** Every active plan on `fromProduct` migrated through the billing action, as the v1 migration task did; false when the action rejects. */
const migrateCustomer = async ({
	ctx,
	customerId,
	fromProduct,
	toProduct,
}: {
	ctx: TestContext;
	customerId: string;
	fromProduct: FullProduct;
	toProduct: FullProduct;
}): Promise<boolean> => {
	try {
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			inStatuses: ACTIVE_STATUSES,
		});
		const customerProducts = fullCustomer.customer_products.filter(
			(customerProduct) =>
				customerProduct.product.internal_id === fromProduct.internal_id,
		);
		for (const customerProduct of customerProducts) {
			await billingActions.migrate({
				ctx,
				fullCustomer,
				currentCustomerProduct: customerProduct,
				newProduct: toProduct,
			});
			await deleteCachedFullCustomer({ ctx, customerId });
		}
		return true;
	} catch {
		return false;
	}
};

const expectUnsafeMigrationRejected = async ({
	customerId,
}: {
	customerId: string;
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
	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [source, target, license] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: source.id,
				licenseProductId: license.id,
				included: 1,
			}),
			s.billing.attach({ productId: source.id }),
			s.licenses.assign({ licenseProductId: license.id, entityIndex: 0 }),
		],
	});
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
		after.assignments.map(({ id, status, customer_license_link_id }) => ({
			id,
			status,
			linkId: customer_license_link_id,
		})),
	).toEqual(
		before.assignments.map(({ id, status, customer_license_link_id }) => ({
			id,
			status,
			linkId: customer_license_link_id,
		})),
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
	`${chalk.yellowBright("licenses migration: target capacity below assignments adds paid seats")}`,
	async () => {
		const customerId = "lic-mig-low-capacity";
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
		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [source, target, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: source.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.licenses.link({
					parentProductId: target.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: source.id }),
				s.licenses.assign({ licenseProductId: license.id, entityIndex: 0 }),
				s.licenses.assign({ licenseProductId: license.id, entityIndex: 1 }),
			],
		});
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
		).toBe(true);

		// Seats never repoint: the target pool adopts the source link.
		const after = await getLicenseDbState({ db: ctx.db, customerId });
		const toSeatAnchors = (assignments: typeof before.assignments) =>
			assignments.map(({ id, customer_license_link_id }) => ({
				id,
				linkId: customer_license_link_id,
			}));
		expect(toSeatAnchors(after.assignments)).toEqual(
			toSeatAnchors(before.assignments),
		);
		await expectLiveLicensePools({
			autumn: autumnV2_2,
			customerId,
			pools: [
				{
					license_plan_id: license.id,
					parent_plan_id: target.id,
					granted: 2,
					usage: 2,
					remaining: 0,
					paid_quantity: 1,
				},
			],
		});
	},
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

		const {
			customerId,
			entities,
			autumnV1,
			autumnV2_2,
			ctx,
			licenseAssignments,
		} = await initScenario({
			customerId: "lic-mig-inherited",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, messageLicense, wordLicense] }),
			],
			actions: [
				...[messageLicense, wordLicense].map((license) =>
					s.licenses.link({
						parentProductId: parent.id,
						licenseProductId: license.id,
						included: 2,
					}),
				),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: messageLicense.id,
					entityIndex: 0,
				}),
				s.licenses.assign({
					licenseProductId: wordLicense.id,
					entityIndex: 1,
				}),
			],
		});
		const assignmentIds = licenseAssignments.map(({ id }) => id);

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
					customerProduct.customer_license_link_id === null,
			);
			expect(activeParent).toHaveLength(1);
			const activePoolLinkIds = new Set(
				dbState.pools
					.filter(
						(pool) => pool.parent_customer_product_id === activeParent[0].id,
					)
					.map((pool) => pool.link_id),
			);
			expect(
				dbState.assignments
					.filter(({ status }) => status === "active")
					.map(({ id, customer_license_link_id }) => ({
						id,
						anchoredToActiveParent: activePoolLinkIds.has(
							customer_license_link_id ?? "",
						),
					}))
					.sort((a, b) => a.id.localeCompare(b.id)),
			).toEqual(
				assignmentIds
					.map((id) => ({ id, anchoredToActiveParent: true }))
					.sort((a, b) => a.id.localeCompare(b.id)),
			);
			await expectLiveLicensePools({
				autumn: autumnV2_2,
				customerId,
				pools: [messageLicense, wordLicense].map((license) => ({
					license_plan_id: license.id,
					parent_plan_id: parent.id,
					granted: 2,
					usage: 1,
					remaining: 1,
				})),
			});
			for (const [index, license] of [messageLicense, wordLicense].entries()) {
				const licenseAssignments = await listLicenseAssignments({
					autumn: autumnV2_2,
					customerId,
					licensePlanId: license.id,
					active: true,
				});
				expect(licenseAssignments.map((assignment) => assignment.id)).toEqual([
					assignmentIds[index],
				]);
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
				actions: [
					s.licenses.link({
						parentProductId: parent.id,
						licenseProductId: license.id,
						included: 1,
					}),
				],
			});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: license.id,
						included: 3,
					},
				],
			},
		});

		for (const entity of entities) {
			await assignLicense({
				autumn: autumnV2_2,
				customerId,
				entityId: entity.id,
				licensePlanId: license.id,
			});
		}

		const poolsBefore = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
		});
		expect(poolsBefore).toHaveLength(1);
		expect(poolsBefore[0]).toMatchObject({
			granted: 3,
			usage: 2,
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
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ACTIVE_STATUSES,
		});
		// Version-bump migrations skip is_custom customer products.
		const customizedParent = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product.internal_id === parentV1.internal_id,
		);
		expect(customizedParent?.is_custom).toBe(true);

		const migratedCustomer = await autumnV1.customers.get<{
			products: { id: string; version?: number }[];
		}>(customerId);
		const parentVersions = migratedCustomer.products
			.filter((product) => product.id === parent.id)
			.map((product) => product.version);
		expect(parentVersions).toContain(1);
		expect(parentVersions).not.toContain(2);

		const poolsAfter = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
		});
		expect(poolsAfter).toHaveLength(1);
		expect(poolsAfter[0]).toMatchObject({
			granted: 3,
			usage: 2,
		});
	},
);
