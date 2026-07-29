/**
 * dfu.flash — entity scope isolation: a customer-level import reconciles only
 * the customer-level scope. An entity-scoped product stays untouched because
 * its entity is not addressed by the payload.
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
	`${chalk.yellowBright("dfu.flash: customer-level import leaves an entity-scoped product untouched")}`,
	async () => {
		const customerId = "dfu-flash-entity-scope-isolation";
		const planX = products.pro({
			id: "dfu-iso-plan-x",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planY = products.premium({
			id: "dfu-iso-plan-y",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const planZ = products.pro({
			id: "dfu-iso-plan-z",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [planX, planY, planZ] }),
			],
			actions: [],
		});
		const entityA = entities[0];

		const subX = await createRealStripeSub(ctx, {
			email: `${customerId}-x@example.com`,
		});
		const subY = await createRealStripeSub(ctx, {
			email: `${customerId}-y@example.com`,
		});
		const subZ = await createRealStripeSub(ctx, {
			email: `${customerId}-z@example.com`,
		});

		// Seed: customer-level X + entity-A Y.
		await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: subX.customerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subX.subscriptionId },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: planX.id, status: "active" }],
						},
					],
				},
			],
			entities: [
				{
					entity_id: entityA.id,
					feature_id: TestFeature.Users,
					billables: [
						{
							processor: "stripe",
							link: { subscription_id: subY.subscriptionId },
							phases: [
								{
									starts_at: "now",
									plans: [{ plan_id: planY.id, status: "active" }],
								},
							],
						},
					],
				},
			],
		});

		// Seeding path must actually create Y as entity-scoped.
		const seeded = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const entityAInternalId = seeded.entities.find(
			(e) => e.id === entityA.id,
		)?.internal_id;
		const seededY = seeded.customer_products.find(
			(cp) => cp.product_id === planY.id,
		);
		expect(seededY?.internal_entity_id).toBe(entityAInternalId);

		// Import only a customer-level plan Z. Entity A is not addressed.
		const secondFlash = await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: subZ.customerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subZ.subscriptionId },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: planZ.id, status: "active" }],
						},
					],
				},
			],
		});

		// X (customer-level) expired; Y (entity A) untouched; Z active.
		const expiredX = secondFlash.result?.flashed?.find(
			(f) => f.plan_id === planX.id,
		);
		expect(expiredX?.expired).toBe(true);
		expect(expiredX?.reason).toBe("expired_not_in_desired_state");

		const productX = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planX.id,
		});
		expect(productX?.status).toBe(CusProductStatus.Expired);

		const productY = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planY.id,
		});
		expect(productY?.status).toBe(CusProductStatus.Active);
		expect(productY?.internal_entity_id).toBe(entityAInternalId);

		const productZ = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planZ.id,
		});
		expect(productZ?.status).toBe(CusProductStatus.Active);
	},
);
