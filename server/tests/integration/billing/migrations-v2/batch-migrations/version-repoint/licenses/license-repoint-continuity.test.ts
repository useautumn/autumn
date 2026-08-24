import { expect, test } from "bun:test";
import {
	customerEntitlements,
	type ProductItem,
	planLicenses,
} from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { and, eq, inArray } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const SEAT_PRICE = 20;

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];
type LicenseState = Awaited<ReturnType<typeof getLicenseDbState>>;

const expectParentRepointed = async ({
	ctx,
	customerId,
	planId,
	before,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	planId: string;
	before: Awaited<ReturnType<typeof readRepointableCustomerPlanRow>>;
}) => {
	const after = await readRepointableCustomerPlanRow({
		ctx,
		customerId,
		planId,
	});
	expectCustomerPlanRepointedInPlace({ before, after, targetVersion: 2 });
};

const expectPoolStatePreserved = ({
	before,
	after,
	targetPlanLicenseId,
}: {
	before: LicenseState["pools"][number];
	after: LicenseState["pools"][number];
	targetPlanLicenseId: string;
}) => {
	expect(after.id).toBe(before.id);
	expect(after.plan_license_id).toBe(targetPlanLicenseId);
	expect({
		linkId: after.link_id,
		paidQuantity: after.paid_quantity,
		granted: after.granted,
		remaining: after.remaining,
	}).toEqual({
		linkId: before.link_id,
		paidQuantity: before.paid_quantity,
		granted: before.granted,
		remaining: before.remaining,
	});
};

const assignmentRows = async ({
	ctx,
	assignmentIds,
}: {
	ctx: ScenarioCtx;
	assignmentIds: string[];
}) =>
	ctx.db
		.select({
			id: customerEntitlements.id,
			customerProductId: customerEntitlements.customer_product_id,
			entitlementId: customerEntitlements.entitlement_id,
			featureId: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
			unlimited: customerEntitlements.unlimited,
		})
		.from(customerEntitlements)
		.where(inArray(customerEntitlements.customer_product_id, assignmentIds));

const readCatalogPlanLicense = async ({
	ctx,
	parentPlanId,
	parentVersion,
	licensePlanId,
}: {
	ctx: ScenarioCtx;
	parentPlanId: string;
	parentVersion: number;
	licensePlanId: string;
}) => {
	const [parentProduct, licenseProduct] = await Promise.all([
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parentPlanId,
			orgId: ctx.org.id,
			env: ctx.env,
			version: parentVersion,
		}),
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: licensePlanId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	]);
	const [planLicense] = await ctx.db
		.select()
		.from(planLicenses)
		.where(
			and(
				eq(planLicenses.parent_internal_product_id, parentProduct.internal_id),
				eq(
					planLicenses.license_internal_product_id,
					licenseProduct.internal_id,
				),
				eq(planLicenses.is_custom, false),
			),
		);
	if (!planLicense) throw new Error("Expected catalog plan license");
	return { parentProduct, licenseProduct, planLicense };
};

const versionParent = async ({
	autumnV2_3,
	parentId,
	items: parentItems = [
		itemsV2.dashboard(),
		itemsV2.monthlyWords({ included: 25 }),
	],
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	parentId: string;
	items?: ProductItem[];
}) => {
	await autumnV2_3.post("/plans.update", {
		plan_id: parentId,
		items: parentItems,
		force_version: true,
	});
};

test.skip(
	`${chalk.yellowBright("batch version repoint licenses: parent versions preserve the pool and assignments")}`,
	async () => {
		const customerId = "bvr-license-parent-continuity-customer";
		const idPrefix = "bvr-license-parent-continuity";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const beforeParent = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId,
			planId: scenario.parent.id,
		});
		const before = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		const [poolBefore] = before.pools;
		expect(poolBefore).toMatchObject({
			paid_quantity: ATTACHED_SEATS - INCLUDED_SEATS,
			granted: ATTACHED_SEATS,
			remaining: ATTACHED_SEATS - ASSIGNED_SEATS,
		});

		await versionParent({
			autumnV2_3: scenario.autumnV2_3,
			parentId: scenario.parent.id,
		});
		const target = await getFullLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: scenario.parent.id,
			parentVersion: 2,
			licensePlanId: scenario.devSeat.id,
			licenseVersion: 1,
		});

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${idPrefix}-migration`,
			filter: {
				customer: {
					plan: { plan_id: scenario.parent.id, version: 1, custom: false },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							plan_id: scenario.parent.id,
							version: 1,
							custom: false,
						},
						version: 2,
					},
				],
			},
		});

		expectBatchLane({ result });
		await expectParentRepointed({
			ctx: scenario.ctx,
			customerId,
			planId: scenario.parent.id,
			before: beforeParent,
		});
		const after = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		expect(after.pools).toHaveLength(1);
		expectPoolStatePreserved({
			before: poolBefore!,
			after: after.pools[0]!,
			targetPlanLicenseId: target.planLicense.id,
		});
		expect(after.assignments.map(({ id }) => id).sort()).toEqual(
			before.assignments.map(({ id }) => id).sort(),
		);
		expect(
			after.assignments.map(
				({ customer_license_link_id }) => customer_license_link_id,
			),
		).toEqual(
			before.assignments.map(
				({ customer_license_link_id }) => customer_license_link_id,
			),
		);
	},
);

// KNOWN BUG (accepted for now): when the parent version carries a NEW child
// version, seat assignments keep pointing at the source child product.
test.skip(
	`${chalk.yellowBright("batch version repoint licenses: a changed child moves seats onto the target child version")}`,
	async () => {
		const customerId = "bvr-license-child-version-customer";
		const idPrefix = "bvr-license-child-version";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: SEAT_PRICE,
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const source = await getFullLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: scenario.parent.id,
			parentVersion: 1,
			licensePlanId: scenario.devSeat.id,
			licenseVersion: 1,
		});
		const before = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		const [poolBefore] = before.pools;
		const liveBefore = before.assignments.filter(
			(assignment) => assignment.internal_entity_id,
		);

		// Versioning the child and propagating it mints parent v2 on the new seat
		// definition while the pool stays on the retired link's child version.
		await scenario.autumnV2_3.post("/plans.update", {
			plan_id: scenario.devSeat.id,
			items: [itemsV2.monthlyMessages({ included: 150 })],
			price: itemsV2.monthlyPrice({ amount: SEAT_PRICE }),
			force_version: true,
			update_license_parents: [{ plan_id: scenario.parent.id, version: 1 }],
		});
		const target = await getFullLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: scenario.parent.id,
			parentVersion: 2,
			licensePlanId: scenario.devSeat.id,
			licenseVersion: 2,
		});
		const targetMessageEntitlement =
			target.fullLicenseProduct.entitlements.find(
				(entitlement) => entitlement.feature_id === TestFeature.Messages,
			);
		expect(targetMessageEntitlement?.allowance).toBe(150);
		expect(target.baseLicenseProduct.internal_id).not.toBe(
			source.baseLicenseProduct.internal_id,
		);

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${idPrefix}-migration`,
			filter: {
				customer: {
					plan: { plan_id: scenario.parent.id, version: 1, custom: false },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							plan_id: scenario.parent.id,
							version: 1,
							custom: false,
						},
						version: 2,
					},
				],
			},
		});

		expectBatchLane({ result });

		const afterParent = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId,
			planId: scenario.parent.id,
		});
		expect(afterParent.version).toBe(2);

		const after = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		const [poolAfter] = after.pools;
		expect(poolAfter!.plan_license_id).toBe(target.planLicense.id);
		expect(poolAfter!.link_id).toBe(poolBefore!.link_id);

		const liveAfter = after.assignments.filter(
			(assignment) => assignment.internal_entity_id,
		);
		expect(liveAfter.map(({ id }) => id).sort()).toEqual(
			liveBefore.map(({ id }) => id).sort(),
		);

		// THE GAP: seats still name the source child product, so the pool claims
		// the v2 link while its assignments sit on v1.
		expect(
			liveAfter.every(
				(assignment) =>
					assignment.internal_product_id ===
					target.baseLicenseProduct.internal_id,
			),
		).toBe(true);

		const entitlementRowsAfter = await assignmentRows({
			ctx: scenario.ctx,
			assignmentIds: liveAfter.map(({ id }) => id),
		});
		const afterMessages = entitlementRowsAfter.filter(
			(row) => row.featureId === TestFeature.Messages,
		);
		expect(afterMessages).toHaveLength(ASSIGNED_SEATS);
		expect(
			afterMessages.every(
				(row) => row.entitlementId === targetMessageEntitlement!.id,
			),
		).toBe(true);
		expect(afterMessages.every((row) => row.balance === 150)).toBe(true);
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint licenses: parent and sibling pools stay isolated")}`,
	async () => {
		const customerId = "bvr-license-isolation-customer";
		const stem = "bvr-license-isolation";
		const targetParent = products.base({
			id: `${stem}-target-parent`,
			items: [items.dashboard()],
			group: `${stem}-target-parent-group`,
		});
		const otherParent = products.base({
			id: `${stem}-other-parent`,
			items: [items.monthlyWords({ includedUsage: 10 })],
			group: `${stem}-other-parent-group`,
		});
		const targetSeat = products.base({
			id: `${stem}-target-seat`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
			group: `${stem}-target-seat-group`,
		});
		const siblingSeat = products.base({
			id: `${stem}-sibling-seat`,
			items: [items.monthlyCredits({ includedUsage: 50 })],
			group: `${stem}-sibling-seat-group`,
		});
		const otherSeat = products.base({
			id: `${stem}-other-seat`,
			items: [items.monthlyWords({ includedUsage: 75 })],
			group: `${stem}-other-seat-group`,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({
					list: [targetParent, otherParent, targetSeat, siblingSeat, otherSeat],
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: targetParent.id,
					licenseProductId: targetSeat.id,
					included: 1,
				}),
				s.licenses.link({
					parentProductId: targetParent.id,
					licenseProductId: siblingSeat.id,
					included: 1,
				}),
				s.licenses.link({
					parentProductId: otherParent.id,
					licenseProductId: otherSeat.id,
					included: 1,
				}),
				s.billing.attach({ productId: targetParent.id }),
				s.billing.attach({ productId: otherParent.id }),
			],
		});
		for (const [planId, entityId] of [
			[targetSeat.id, `${stem}-target-entity`],
			[siblingSeat.id, `${stem}-sibling-entity`],
			[otherSeat.id, `${stem}-other-entity`],
		]) {
			await scenario.autumnV2_3.licenses.attach({
				customer_id: customerId,
				plan_id: planId,
				entities: [
					{
						entity_id: entityId,
						name: entityId,
						feature_id: TestFeature.Users,
					},
				],
			});
		}

		const beforeParent = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId,
			planId: targetParent.id,
		});
		const before = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		const targetV1 = await readCatalogPlanLicense({
			ctx: scenario.ctx,
			parentPlanId: targetParent.id,
			parentVersion: 1,
			licensePlanId: targetSeat.id,
		});
		const siblingV1 = await readCatalogPlanLicense({
			ctx: scenario.ctx,
			parentPlanId: targetParent.id,
			parentVersion: 1,
			licensePlanId: siblingSeat.id,
		});
		const otherV1 = await readCatalogPlanLicense({
			ctx: scenario.ctx,
			parentPlanId: otherParent.id,
			parentVersion: 1,
			licensePlanId: otherSeat.id,
		});
		await versionParent({
			autumnV2_3: scenario.autumnV2_3,
			parentId: targetParent.id,
		});
		const [targetV2, siblingV2] = await Promise.all([
			readCatalogPlanLicense({
				ctx: scenario.ctx,
				parentPlanId: targetParent.id,
				parentVersion: 2,
				licensePlanId: targetSeat.id,
			}),
			readCatalogPlanLicense({
				ctx: scenario.ctx,
				parentPlanId: targetParent.id,
				parentVersion: 2,
				licensePlanId: siblingSeat.id,
			}),
		]);

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: {
				customer: {
					plan: { plan_id: targetParent.id, version: 1, custom: false },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							plan_id: targetParent.id,
							version: 1,
							custom: false,
						},
						version: 2,
					},
				],
			},
		});

		expectBatchLane({ result });
		await expectParentRepointed({
			ctx: scenario.ctx,
			customerId,
			planId: targetParent.id,
			before: beforeParent,
		});
		const after = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		const poolsBefore = new Map(
			before.pools.map((pool) => [pool.plan_license_id, pool]),
		);
		const poolsAfter = new Map(
			after.pools.map((pool) => [pool.plan_license_id, pool]),
		);
		// Every link on the versioned parent gets its own v2 plan_license row, so
		// both pools follow their own link and neither adopts the other's.
		for (const [poolBefore, planLicenseAfter] of [
			[poolsBefore.get(targetV1.planLicense.id), targetV2.planLicense],
			[poolsBefore.get(siblingV1.planLicense.id), siblingV2.planLicense],
		] as const) {
			const poolAfter = poolsAfter.get(planLicenseAfter.id);
			expectPoolStatePreserved({
				before: poolBefore!,
				after: poolAfter!,
				targetPlanLicenseId: planLicenseAfter.id,
			});
			expect(poolAfter!.license_internal_product_id).toBe(
				poolBefore!.license_internal_product_id,
			);
		}
		expect(poolsAfter.get(otherV1.planLicense.id)).toEqual(
			poolsBefore.get(otherV1.planLicense.id),
		);
		expect(after.pools).toHaveLength(before.pools.length);
		expect(after.assignments).toEqual(before.assignments);
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint licenses: version and upsert compose on the target parent")}`,
	async () => {
		const customerId = "bvr-license-version-upsert-customer";
		const idPrefix = "bvr-license-version-upsert";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: SEAT_PRICE,
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });
		const beforeParent = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId,
			planId: scenario.parent.id,
		});
		const before = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		await versionParent({
			autumnV2_3: scenario.autumnV2_3,
			parentId: scenario.parent.id,
		});
		const target = await getFullLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: scenario.parent.id,
			parentVersion: 2,
			licensePlanId: scenario.devSeat.id,
		});

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${idPrefix}-migration`,
			filter: {
				customer: {
					plan: { plan_id: scenario.parent.id, version: 1, custom: false },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							plan_id: scenario.parent.id,
							version: 1,
							custom: false,
						},
						version: 2,
						customize: {
							upsert_licenses: [
								{
									license_plan_id: scenario.devSeat.id,
									customize: { add_items: [itemsV2.dashboard()] },
								},
							],
						},
					},
				],
			},
		});

		expectBatchLane({ result });
		await expectParentRepointed({
			ctx: scenario.ctx,
			customerId,
			planId: scenario.parent.id,
			before: beforeParent,
		});
		const after = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		const [pool] = after.pools;
		expectPoolStatePreserved({
			before: before.pools[0]!,
			after: pool!,
			targetPlanLicenseId: pool!.plan_license_id!,
		});
		const [customLink] = await scenario.ctx.db
			.select()
			.from(planLicenses)
			.where(eq(planLicenses.id, pool!.plan_license_id!));
		expect(customLink).toMatchObject({
			parent_internal_product_id: target.parentProduct.internal_id,
			license_internal_product_id: target.baseLicenseProduct.internal_id,
			is_custom: true,
			customized: true,
		});

		const liveAssignments = after.assignments.filter(
			(assignment) => assignment.internal_entity_id,
		);
		expect(liveAssignments.map(({ id }) => id).sort()).toEqual(
			before.assignments
				.filter((assignment) => assignment.internal_entity_id)
				.map(({ id }) => id)
				.sort(),
		);
		const rows = await assignmentRows({
			ctx: scenario.ctx,
			assignmentIds: liveAssignments.map(({ id }) => id),
		});
		expect(
			rows.filter((row) => row.featureId === TestFeature.Dashboard),
		).toHaveLength(ASSIGNED_SEATS);
	},
);
