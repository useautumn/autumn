/**
 * dfu.flash — entity set-state: importing a new plan for entity A expires
 * entity A's prior plan while leaving the customer-level scope and a second
 * entity B untouched.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import {
	callFlash,
	createRealStripeSub,
	type FlashClient,
	getFlashedCustomerProduct,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: importing a plan for one entity reconciles only that entity")}`,
	async () => {
		const customerId = "dfu-flash-entity-set-state";
		const planC = products.pro({
			id: "dfu-ess-plan-c",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planY = products.premium({
			id: "dfu-ess-plan-y",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const planB = products.pro({
			id: "dfu-ess-plan-b",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});
		const planW = products.premium({
			id: "dfu-ess-plan-w",
			items: [items.monthlyMessages({ includedUsage: 400 })],
		});

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [planC, planY, planB, planW] }),
			],
			actions: [],
		});
		const [entityA, entityB] = entities;

		const subC = await createRealStripeSub(ctx, {
			email: `${customerId}-c@example.com`,
		});
		const subY = await createRealStripeSub(ctx, {
			email: `${customerId}-y@example.com`,
		});
		const subB = await createRealStripeSub(ctx, {
			email: `${customerId}-b@example.com`,
		});
		const subW = await createRealStripeSub(ctx, {
			email: `${customerId}-w@example.com`,
		});

		const entityBillable = (
			entityId: string,
			subscriptionId: string,
			planId: string,
		) => ({
			entity_id: entityId,
			feature_id: TestFeature.Users,
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subscriptionId },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: planId, status: "active" }],
						},
					],
				},
			],
		});

		// Seed: customer-level C, entity-A Y, entity-B B.
		await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: subC.customerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subC.subscriptionId },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: planC.id, status: "active" }],
						},
					],
				},
			],
			entities: [
				entityBillable(entityA.id, subY.subscriptionId, planY.id),
				entityBillable(entityB.id, subB.subscriptionId, planB.id),
			],
		});

		const seeded = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const entityAInternalId = seeded.entities.find(
			(e) => e.id === entityA.id,
		)?.internal_id;

		// Import entity A → plan W only. Customer-level and entity B are not addressed.
		const secondFlash = await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: subW.customerId }],
			billables: [],
			entities: [entityBillable(entityA.id, subW.subscriptionId, planW.id)],
		});

		// Y (entity A prior plan) expired within A.
		const expiredY = secondFlash.result?.flashed?.find(
			(f) => f.plan_id === planY.id,
		);
		expect(expiredY?.expired).toBe(true);
		expect(expiredY?.reason).toBe("expired_not_in_desired_state");

		const productY = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planY.id,
		});
		expect(productY?.status).toBe(CusProductStatus.Expired);

		// W active and scoped to entity A.
		const productW = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planW.id,
		});
		expect(productW?.status).toBe(CusProductStatus.Active);
		expect(productW?.internal_entity_id).toBe(entityAInternalId);

		// Customer-level C untouched.
		const productC = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planC.id,
		});
		expect(productC?.status).toBe(CusProductStatus.Active);

		// Entity B untouched.
		const productB = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planB.id,
		});
		expect(productB?.status).toBe(CusProductStatus.Active);
	},
);
