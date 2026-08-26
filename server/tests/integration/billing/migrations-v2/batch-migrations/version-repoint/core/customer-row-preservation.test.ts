import { expect, test } from "bun:test";
import {
	customerEntitlements,
	customerProducts,
	rollovers,
} from "@autumn/shared";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { and, eq, inArray } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";
import {
	attachCustomerPaidPrice,
	expectCustomerPriceSurvives,
	readScopedFeatureRow,
	repointToCustomEntitlement,
} from "../../paidRowTestUtils";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	expectPerCustomerLaneWithRejections,
	readCustomerPlanRows,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const versionOperation = ({
	planId,
	version = 2,
}: {
	planId: string;
	version?: number;
}) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId, custom: false },
			version,
		},
	],
});

const createVersion = async ({
	autumnV2_3,
	planId,
	items: nextItems,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	items: unknown[];
}) =>
	autumnV2_3.post("/plans.update", {
		plan_id: planId,
		force_version: true,
		items: nextItems,
	});

test.skip(
	`${chalk.yellowBright("batch version repoint: custom entitlement meanings and paid overrides stay safe")}`,
	async () => {
		const prefix = "repoint-customer-definitions";
		const plainId = `${prefix}-plain`;
		const sameMeaningId = `${prefix}-same`;
		const differentId = `${prefix}-different`;
		const paidId = `${prefix}-paid`;
		const plan = products.base({
			id: `${prefix}-plan`,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const paidTemplate = products.base({
			id: `${prefix}-paid-template`,
			items: [items.consumableMessages()],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([
					{ id: sameMeaningId },
					{ id: differentId },
					{ id: paidId },
				]),
				s.products({ list: [plan, paidTemplate] }),
			],
			actions: [],
		});
		for (const customerId of [plainId, sameMeaningId, differentId, paidId]) {
			await autumnV2_3.billing.attach({
				customer_id: customerId,
				plan_id: plan.id,
			});
		}

		const sameCustomId = await repointToCustomEntitlement({
			ctx,
			customerId: sameMeaningId,
			featureId: TestFeature.Messages,
		});
		const differentCustomId = await repointToCustomEntitlement({
			ctx,
			customerId: differentId,
			featureId: TestFeature.Messages,
			overrides: { allowance: 500 },
		});
		const paid = await attachCustomerPaidPrice({
			ctx,
			customerId: paidId,
			featureId: TestFeature.Messages,
			templatePlanId: paidTemplate.id,
		});
		const paidBefore = await readScopedFeatureRow({
			ctx,
			customerId: paidId,
			featureId: TestFeature.Messages,
		});
		const productsBefore = new Map(
			await Promise.all(
				[plainId, sameMeaningId, differentId, paidId].map(
					async (customerId) =>
						[
							customerId,
							await readRepointableCustomerPlanRow({
								ctx,
								customerId,
								planId: plan.id,
							}),
						] as const,
				),
			),
		);

		await createVersion({
			autumnV2_3,
			planId: plan.id,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: {
				customer: {
					customer_id: { $in: [plainId, sameMeaningId, differentId, paidId] },
				},
			},
			operations: versionOperation({ planId: plan.id }),
		});
		expectBatchLane({ result });

		for (const customerId of [plainId, sameMeaningId, differentId, paidId]) {
			const before = productsBefore.get(customerId);
			if (!before) throw new Error(`Missing before row for ${customerId}`);
			expectCustomerPlanRepointedInPlace({
				before,
				after: await readRepointableCustomerPlanRow({
					ctx,
					customerId,
					planId: plan.id,
				}),
				targetVersion: 2,
			});
		}

		const sameAfter = await readScopedFeatureRow({
			ctx,
			customerId: sameMeaningId,
			featureId: TestFeature.Messages,
		});
		expect(sameAfter.entitlement_id).not.toBe(sameCustomId);
		const differentAfter = await readScopedFeatureRow({
			ctx,
			customerId: differentId,
			featureId: TestFeature.Messages,
		});
		expect(differentAfter.entitlement_id).toBe(differentCustomId);
		const paidAfter = await readScopedFeatureRow({
			ctx,
			customerId: paidId,
			featureId: TestFeature.Messages,
		});
		expect(paidAfter.entitlement_id).toBe(paidBefore.entitlement_id);
		await expectCustomerPriceSurvives({
			ctx,
			customerPriceId: paid.customerPriceId,
		});
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint: accrued rollover rows remain attached")}`,
	async () => {
		const prefix = "repoint-rollover";
		const customerId = `${prefix}-customer`;
		const plan = products.base({
			id: `${prefix}-plan`,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		const messageBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const rolloverId = generateId("ro");
		await ctx.db.insert(rollovers).values({
			id: rolloverId,
			cus_ent_id: messageBefore.id,
			balance: 37,
			expires_at: 1_900_000_000_000,
			usage: 4,
			entities: {},
		});

		await createVersion({
			autumnV2_3,
			planId: plan.id,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: { customer: { customer_id: customerId } },
			operations: versionOperation({ planId: plan.id }),
		});
		expectBatchLane({ result });
		expectCustomerPlanRepointedInPlace({
			before,
			after: await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			}),
			targetVersion: 2,
		});
		const [rolloverAfter] = await ctx.db
			.select({
				id: rollovers.id,
				customerEntitlementId: rollovers.cus_ent_id,
				balance: rollovers.balance,
				usage: rollovers.usage,
				expiresAt: rollovers.expires_at,
			})
			.from(rollovers)
			.where(eq(rollovers.id, rolloverId));
		expect(rolloverAfter).toEqual({
			id: rolloverId,
			customerEntitlementId: messageBefore.id,
			balance: 37,
			usage: 4,
			expiresAt: 1_900_000_000_000,
		});
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint: pooled contributions force a safe per-customer lane")}`,
	async () => {
		const prefix = "repoint-pooled";
		const customerId = `${prefix}-customer`;
		const pooledItem = {
			...items.monthlyMessages({ includedUsage: 100 }),
			pooled: true,
		};
		const plan = products.base({
			id: `${prefix}-plan`,
			items: [pooledItem],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
			entity_id: "ent-1",
		});
		const before = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(before.pools).toHaveLength(1);
		expect(before.contributions).toHaveLength(1);

		await createVersion({
			autumnV2_3,
			planId: plan.id,
			items: [{ ...itemsV2.monthlyMessages({ included: 100 }), pooled: true }],
		});
		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: { customer: { customer_id: customerId } },
			operations: versionOperation({ planId: plan.id }),
		});
		expectPerCustomerLaneWithRejections({
			result,
			codes: ["pooled_add_item"],
		});

		// The pool anchor hangs off no customer product, so no batch write may
		// reach it; the fallback re-sources the contribution onto its new row.
		const after = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(after.pools).toEqual(before.pools);
		const productAfter = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(productAfter.version).toBe(2);
		expect(
			after.contributions.map(
				({
					source_customer_product_id,
					current_contribution,
					next_cycle_contribution,
				}) => ({
					source_customer_product_id,
					current_contribution,
					next_cycle_contribution,
				}),
			),
		).toEqual(
			before.contributions.map(
				({ current_contribution, next_cycle_contribution }) => ({
					source_customer_product_id: productAfter.id,
					current_contribution,
					next_cycle_contribution,
				}),
			),
		);
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint: entity-level parent copies repoint independently")}`,
	async () => {
		const prefix = "repoint-entity-parents";
		const customerId = `${prefix}-customer`;
		const plan = products.base({
			id: `${prefix}-plan`,
			items: [itemsV2.dashboard()],
		});
		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});
		for (const entity of entities) {
			await autumnV2_3.billing.attach({
				customer_id: customerId,
				plan_id: plan.id,
				entity_id: entity.id,
			});
		}
		const before = await readCustomerPlanRows({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(before).toHaveLength(2);
		await createVersion({
			autumnV2_3,
			planId: plan.id,
			items: [itemsV2.dashboard()],
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: { customer: { customer_id: customerId } },
			operations: versionOperation({ planId: plan.id }),
		});
		expectBatchLane({ result });
		const after = await readCustomerPlanRows({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(after).toHaveLength(2);
		for (const beforeRow of before) {
			const afterRow = after.find(({ id }) => id === beforeRow.id);
			if (!afterRow) throw new Error(`Missing entity row ${beforeRow.id}`);
			expectCustomerPlanRepointedInPlace({
				before: beforeRow,
				after: afterRow,
				targetVersion: 2,
			});
		}
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint: entity-scoped entitlement transitions fall back")}`,
	async () => {
		const prefix = "repoint-entity-entitlement";
		const customerId = `${prefix}-customer`;
		const plan = products.base({
			id: `${prefix}-plan`,
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
		});
		const readEntitlementRows = () =>
			ctx.db
				.select({
					id: customerEntitlements.id,
					customerProductId: customerEntitlements.customer_product_id,
					balance: customerEntitlements.balance,
					entities: customerEntitlements.entities,
				})
				.from(customerEntitlements)
				.where(eq(customerEntitlements.customer_id, customerId));
		const before = await readEntitlementRows();
		const productBefore = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		await createVersion({
			autumnV2_3,
			planId: plan.id,
			items: [
				{
					...itemsV2.monthlyMessages({ included: 100 }),
					entity_feature_id: TestFeature.Users,
				},
			],
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: { customer: { customer_id: customerId } },
			operations: versionOperation({ planId: plan.id }),
		});
		expectPerCustomerLaneWithRejections({
			result,
			codes: ["entity_scoped_entitlement"],
		});

		// No in-place batch write may touch the entity-scoped rows; the fallback
		// expires them and re-inserts on the target version with balances carried.
		const after = await readEntitlementRows();
		const beforeIds = new Set(before.map(({ id }) => id));
		expect(after.filter(({ id }) => beforeIds.has(id))).toEqual(before);
		const productAfter = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(productAfter.id).not.toBe(productBefore.id);
		expect(productAfter.version).toBe(2);
		expect(
			after
				.filter(
					({ customerProductId }) => customerProductId === productAfter.id,
				)
				.map(({ balance, entities }) => ({ balance, entities })),
		).toEqual(before.map(({ balance, entities }) => ({ balance, entities })));
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint: ordinary parent repoints exclude license-seat children")}`,
	async () => {
		const prefix = "repoint-license-seat";
		const customerId = `${prefix}-customer`;
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: prefix,
			parentItems: [items.dashboard()],
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: 1,
			attachedSeats: 2,
		});
		await scenario.assignSeats({ count: 1 });
		const { autumnV2_3, ctx, parent } = scenario;
		const parentBefore = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: parent.id,
		});
		const licenseBefore = await getLicenseDbState({ db: ctx.db, customerId });
		const seatIds = licenseBefore.assignments.map(({ id }) => id);
		const seatProductIds = licenseBefore.assignments.map(
			({ internal_product_id }) => internal_product_id,
		);

		await createVersion({
			autumnV2_3,
			planId: parent.id,
			items: [itemsV2.dashboard()],
		});
		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: { customer: { customer_id: customerId } },
			operations: versionOperation({ planId: parent.id }),
		});
		expectBatchLane({ result });
		expectCustomerPlanRepointedInPlace({
			before: parentBefore,
			after: await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: parent.id,
			}),
			targetVersion: 2,
		});

		const licenseAfter = await getLicenseDbState({ db: ctx.db, customerId });
		expect(licenseAfter.assignments.map(({ id }) => id)).toEqual(seatIds);
		expect(
			licenseAfter.assignments.map(
				({ internal_product_id }) => internal_product_id,
			),
		).toEqual(seatProductIds);
		const linkedSeats = await ctx.db
			.select({ id: customerProducts.id })
			.from(customerProducts)
			.where(
				and(
					inArray(customerProducts.id, seatIds),
					eq(customerProducts.product_id, parent.id),
				),
			);
		expect(linkedSeats).toHaveLength(0);
	},
);
