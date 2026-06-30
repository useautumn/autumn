import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	type CheckResponseV3,
	ErrCode,
	FreeTrialDuration,
	ProductErrorCode,
	ProductCatalogType,
	licensePools,
	type LicensePoolResponse,
	type ProductV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";

const makeLicenseProduct = () => ({
	...products.base({
		id: "seat-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
	catalog_type: ProductCatalogType.License,
});

test.concurrent(
	`${chalk.yellowBright("licenses: assignment lazily provisions entity-scoped grant")}`,
	async () => {
		const parent = products.base({
			id: "parent-plan",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct();

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-lazy-assign",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 1,
		});

		const { products: licenseProducts } = (await autumnV2_2.get(
			"/products/license_products",
		)) as { products: ProductV2[] };
		const licenseProduct = licenseProducts.find(
			(product) => product.id === license.id,
		);
		expect(licenseProduct?.catalog_type).toBe(ProductCatalogType.License);
		expect(licenseProducts.some((product) => product.id === parent.id)).toBe(
			false,
		);

		const { list: planProducts } = (await autumnV2_2.get("/products")) as {
			list: Array<{ id?: string; plan_id?: string }>;
		};
		expect(
			planProducts.some(
				(product) =>
					product.id === license.id || product.plan_id === license.id,
			),
		).toBe(false);

		const poolsBeforeAssign = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicensePoolResponse[] };
		expect(poolsBeforeAssign.list).toHaveLength(1);
		expect(poolsBeforeAssign.list[0]).toMatchObject({
			license_product_id: license.id,
			license_product_name: license.name,
			inventory: {
				included_quantity: 1,
				paid_quantity: 0,
				assigned: 0,
				available: 1,
			},
			assignments: [],
		});

		const customerBefore = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(customerBefore.allowed).toBe(false);

		const { assignment } = (await autumnV2_2.post("/licenses.assign", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
			metadata: { source: "test" },
		})) as {
			assignment: {
				id: string;
				entity_id: string;
				license_product_id: string;
				started_at: number;
				ended_at: number | null;
				metadata?: Record<string, unknown>;
			};
		};
		expect(assignment).toMatchObject({
			entity_id: entities[0].id,
			license_product_id: license.id,
			ended_at: null,
			metadata: { source: "test" },
		});
		expect("internal_customer_id" in assignment).toBe(false);
		expect("internal_entity_id" in assignment).toBe(false);
		expect("license_internal_product_id" in assignment).toBe(false);
		expect(assignment.id).toBeTruthy();
		expect(assignment.started_at).toBeGreaterThan(0);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const pools = await ctx.db.query.licensePools.findMany({
			where: and(
				eq(licensePools.org_id, ctx.org.id),
				eq(licensePools.env, ctx.env),
				eq(licensePools.internal_customer_id, fullCustomer.internal_id),
			),
		});
		expect(pools).toHaveLength(1);

		const poolsAfterAssign = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicensePoolResponse[] };
		expect(poolsAfterAssign.list[0]).toMatchObject({
			license_product_id: license.id,
			inventory: {
				included_quantity: 1,
				paid_quantity: 0,
				assigned: 1,
				available: 0,
			},
			assignments: [
				{
					entity_id: entities[0].id,
					license_product_id: license.id,
				},
			],
		});
		expect(poolsAfterAssign.list[0].assignments[0].assignment_id).toBeTruthy();
		expect(poolsAfterAssign.list[0].assignments[0].started_at).toBeGreaterThan(
			0,
		);
		const assignmentId = poolsAfterAssign.list[0].assignments[0].assignment_id;
		expect(assignmentId).toBe(assignment.id);

		const activeAssignments = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: license.id,
			},
		)) as {
			list: Array<{
				id: string;
				entity_id: string;
				license_product_id: string;
				ended_at: number | null;
			}>;
		};
		expect(activeAssignments.list).toHaveLength(1);
		expect(activeAssignments.list[0]).toMatchObject({
			id: assignmentId,
			entity_id: entities[0].id,
			license_product_id: license.id,
			ended_at: null,
		});
		expect("internal_customer_id" in activeAssignments.list[0]).toBe(false);

		const assignedEntity = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(assignedEntity.allowed).toBe(true);

		const otherEntity = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(otherEntity.allowed).toBe(false);

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.assign", {
					customer_id: customerId,
					entity_id: entities[1].id,
					plan_id: license.id,
				}),
		});

		const assignmentsAfterExhaustedAttempt = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				plan_id: license.id,
			},
		)) as { list: unknown[] };
		expect(assignmentsAfterExhaustedAttempt.list).toHaveLength(1);

		const customerAfter = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(customerAfter.allowed).toBe(false);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(
			customer.subscriptions.some(
				(subscription) => subscription.plan_id === license.id,
			),
		).toBe(false);

		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: { start_cursor: "", limit: 10, show_expired: false },
		});
		expect(page.list.some((item) => item.product.id === license.id)).toBe(
			false,
		);

		const { assignment: endedAssignment } = (await autumnV2_2.post(
			"/licenses.unassign",
			{ assignment_id: assignmentId },
		)) as {
			assignment: {
				id: string;
				entity_id: string;
				license_product_id: string;
				ended_at: number | null;
			};
		};
		expect(endedAssignment.id).toBe(assignmentId);
		expect(endedAssignment.entity_id).toBe(entities[0].id);
		expect(endedAssignment.license_product_id).toBe(license.id);
		expect(endedAssignment.ended_at).toBeGreaterThan(0);

		const activeAssignmentsAfterUnassign = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: license.id,
			},
		)) as { list: unknown[] };
		expect(activeAssignmentsAfterUnassign.list).toHaveLength(0);

		const allAssignmentsAfterUnassign = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: license.id,
				active: false,
			},
		)) as {
			list: Array<{ id: string; ended_at: number | null }>;
		};
		expect(allAssignmentsAfterUnassign.list[0].id).toBe(assignmentId);
		expect(allAssignmentsAfterUnassign.list[0].ended_at).toBeGreaterThan(0);

		const poolsAfterUnassign = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicensePoolResponse[] };
		expect(poolsAfterUnassign.list[0]).toMatchObject({
			inventory: {
				included_quantity: 1,
				paid_quantity: 0,
				assigned: 0,
				available: 1,
			},
			assignments: [],
		});

		const unassignedEntity = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(unassignedEntity.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: direct attach and paid extras are rejected")}`,
	async () => {
		const parent = products.base({
			id: "parent-plan",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct();

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "license-rejects",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: license.id,
					redirect_mode: "if_required",
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.set_plan_license", {
					parent_plan_id: parent.id,
					license_plan_id: license.id,
					included_quantity: 1,
					allow_extra_quantity: true,
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: update edits license products only")}`,
	async () => {
		const parent = products.base({
			id: "license-update-parent",
			items: [items.dashboard()],
		});
		const license = {
			...makeLicenseProduct(),
			id: "license-update-seat",
		};

		const { autumnV2_2 } = await initScenario({
			customerId: "license-update",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		const { products: cachedBefore } = (await autumnV2_2.get(
			"/products/license_products",
		)) as { products: ProductV2[] };
		expect(
			cachedBefore
				.find((product) => product.id === license.id)
				?.items.some(
					(item) =>
						item.feature_id === TestFeature.Messages &&
						"included_usage" in item &&
						item.included_usage === 25,
				),
		).toBe(true);

		const updated = (await autumnV2_2.post("/licenses.update", {
			license_plan_id: license.id,
			name: "Updated seat license",
			items: [items.monthlyMessages({ includedUsage: 50 })],
			catalog_type: ProductCatalogType.License,
		})) as ProductV2;

		expect(updated).toMatchObject({
			id: license.id,
			name: "Updated seat license",
			catalog_type: ProductCatalogType.License,
		});
		expect(
			updated.items.some(
				(item) =>
					item.feature_id === TestFeature.Messages &&
					"included_usage" in item &&
					item.included_usage === 50,
			),
		).toBe(true);

		const { products: licenseProducts } = (await autumnV2_2.get(
			"/products/license_products",
		)) as { products: ProductV2[] };
		const listedLicense = licenseProducts.find(
			(product) => product.id === license.id,
		);
		expect(listedLicense?.name).toBe("Updated seat license");
		expect(listedLicense?.catalog_type).toBe(ProductCatalogType.License);

		await expectAutumnError({
			errCode: ErrCode.InvalidInputs,
			func: () =>
				autumnV2_2.post("/licenses.update", {
					license_plan_id: license.id,
					catalog_type: ProductCatalogType.Plan,
				}),
		});

		for (const updates of [
			{ is_default: true },
			{ base_plan_id: parent.id },
			{
				free_trial: {
					length: 1,
					duration: FreeTrialDuration.Day,
					card_required: false,
				},
			},
		]) {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_2.post("/licenses.update", {
						license_plan_id: license.id,
						...updates,
					}),
			});
		}

		await expectAutumnError({
			errCode: ProductErrorCode.ProductNotFound,
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: license.id,
					name: "Should still be plan-only",
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: plan license customize overrides the base grant")}`,
	async () => {
		const parent = products.base({
			id: "license-custom-enterprise",
			items: [items.dashboard()],
		});
		const license = {
			...makeLicenseProduct(),
			id: "license-custom-seat",
		};

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "license-custom-cus",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 2,
			customize: {
				items: [itemsV2.monthlyMessages({ included: 100 })],
			},
		});

		const { list: enterprisePlanLicenses } = (await autumnV2_2.post(
			"/licenses.list_plan_licenses",
			{ parent_plan_id: parent.id },
		)) as {
			list: Array<{
				parent_plan_id: string;
				license_plan_id: string;
				customize?: { items?: Array<{ included?: number }> };
			}>;
		};
		expect(enterprisePlanLicenses[0].parent_plan_id).toBe(parent.id);
		expect(enterprisePlanLicenses[0].license_plan_id).toBe(license.id);
		expect("parent_internal_product_id" in enterprisePlanLicenses[0]).toBe(
			false,
		);
		expect("license_internal_product_id" in enterprisePlanLicenses[0]).toBe(
			false,
		);
		expect(enterprisePlanLicenses[0].customize?.items?.[0].included).toBe(100);

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 3,
		});
		const { list: updatedEnterprisePlanLicenses } = (await autumnV2_2.post(
			"/licenses.list_plan_licenses",
			{ parent_plan_id: parent.id },
		)) as {
			list: Array<{ customize?: { items?: Array<{ included?: number }> } }>;
		};
		expect(
			updatedEnterprisePlanLicenses[0].customize?.items?.[0].included,
		).toBe(100);

		await autumnV2_2.post("/licenses.assign", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const enterpriseCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});

		expect(enterpriseCheck.balance?.granted).toBe(100);

		const pools = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
		})) as { list: LicensePoolResponse[] };
		const enterprisePool = pools.list[0];
		expect(enterprisePool?.inventory).toMatchObject({
			included_quantity: 3,
			assigned: 1,
			available: 2,
		});
	},
);
