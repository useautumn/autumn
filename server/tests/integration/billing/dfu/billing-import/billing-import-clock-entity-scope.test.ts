/**
 * dfu.flash (test clock) — entity scope isolation with real advancing dates.
 * Importing one scope reconciles only that scope; the other scope's product and
 * its real mid-cycle anchor stay untouched.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import {
	advanceClock,
	callFlash,
	createRealStripeCustomerOnClock,
	createRealStripeSubOnClock,
	type FlashClient,
	getFlashedCustomerProduct,
	THIRTY_DAYS_MS,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const DAY = THIRTY_DAYS_MS / 30;

const periodEndMs = async (ctx: TestContext, subscriptionId: string) => {
	const sub = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	return sub.items.data[0].current_period_end * 1000;
};

test.concurrent(
	`${chalk.yellowBright("dfu.flash clock: entity import leaves the customer-level anchor untouched")}`,
	async () => {
		const customerId = "dfu-flash-clock-entity-scope-a";
		const planX = products.pro({
			id: "dfu-clock-scope-a-x",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planY = products.premium({
			id: "dfu-clock-scope-a-y",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const planZ = products.pro({
			id: "dfu-clock-scope-a-z",
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

		// Seed subs (customer-level X + entity-A Y) share one clock frozen 15d back.
		const seed = await createRealStripeCustomerOnClock(ctx, {
			email: `${customerId}-seed@example.com`,
			frozenTime: Date.now() - DAY * 15,
		});
		const subX = await createRealStripeSubOnClock(ctx, {
			customerId: seed.customerId,
			label: `${customerId}-x`,
		});
		const subY = await createRealStripeSubOnClock(ctx, {
			customerId: seed.customerId,
			label: `${customerId}-y`,
		});
		await advanceClock(ctx, {
			testClockId: seed.testClockId,
			advanceTo: Date.now(),
		});

		const xAnchor = await periodEndMs(ctx, subX.subscriptionId);

		await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: seed.customerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subX.subscriptionId },
					phases: [{ starts_at: "now", plans: [{ plan_id: planX.id }] }],
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
							phases: [{ starts_at: "now", plans: [{ plan_id: planY.id }] }],
						},
					],
				},
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
		const seededX = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planX.id,
		});
		expect(seededX?.billing_cycle_anchor).toBe(xAnchor);

		// Reconcile sub for entity A only, on a second clock frozen 10d back.
		const recon = await createRealStripeCustomerOnClock(ctx, {
			email: `${customerId}-z@example.com`,
			frozenTime: Date.now() - DAY * 10,
		});
		const subZ = await createRealStripeSubOnClock(ctx, {
			customerId: recon.customerId,
			label: `${customerId}-z`,
		});
		await advanceClock(ctx, {
			testClockId: recon.testClockId,
			advanceTo: Date.now(),
		});
		const zAnchor = await periodEndMs(ctx, subZ.subscriptionId);
		expect(zAnchor).toBeGreaterThan(Date.now());

		// Import only entity A → plan Z. Customer-level X is not addressed.
		await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: recon.customerId }],
			billables: [],
			entities: [
				{
					entity_id: entityA.id,
					feature_id: TestFeature.Users,
					billables: [
						{
							processor: "stripe",
							link: { subscription_id: subZ.subscriptionId },
							phases: [{ starts_at: "now", plans: [{ plan_id: planZ.id }] }],
						},
					],
				},
			],
		});

		// Y expired within entity A; Z active on entity A with its own real anchor.
		const productY = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planY.id,
		});
		expect(productY?.status).toBe(CusProductStatus.Expired);

		const productZ = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planZ.id,
		});
		expect(productZ?.status).toBe(CusProductStatus.Active);
		expect(productZ?.internal_entity_id).toBe(entityAInternalId);
		expect(productZ?.billing_cycle_anchor).toBe(zAnchor);

		// Customer-level X untouched: still active with its original anchor.
		const productX = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planX.id,
		});
		expect(productX?.status).toBe(CusProductStatus.Active);
		expect(productX?.billing_cycle_anchor).toBe(xAnchor);
	},
);

test.concurrent(
	`${chalk.yellowBright("dfu.flash clock: customer import leaves the entity anchor untouched")}`,
	async () => {
		const customerId = "dfu-flash-clock-entity-scope-b";
		const planP = products.pro({
			id: "dfu-clock-scope-b-p",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planQ = products.premium({
			id: "dfu-clock-scope-b-q",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const planR = products.pro({
			id: "dfu-clock-scope-b-r",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [planP, planQ, planR] }),
			],
			actions: [],
		});
		const entityA = entities[0];

		const seed = await createRealStripeCustomerOnClock(ctx, {
			email: `${customerId}-seed@example.com`,
			frozenTime: Date.now() - DAY * 15,
		});
		const subP = await createRealStripeSubOnClock(ctx, {
			customerId: seed.customerId,
			label: `${customerId}-p`,
		});
		const subQ = await createRealStripeSubOnClock(ctx, {
			customerId: seed.customerId,
			label: `${customerId}-q`,
		});
		await advanceClock(ctx, {
			testClockId: seed.testClockId,
			advanceTo: Date.now(),
		});

		const qAnchor = await periodEndMs(ctx, subQ.subscriptionId);

		await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: seed.customerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subP.subscriptionId },
					phases: [{ starts_at: "now", plans: [{ plan_id: planP.id }] }],
				},
			],
			entities: [
				{
					entity_id: entityA.id,
					feature_id: TestFeature.Users,
					billables: [
						{
							processor: "stripe",
							link: { subscription_id: subQ.subscriptionId },
							phases: [{ starts_at: "now", plans: [{ plan_id: planQ.id }] }],
						},
					],
				},
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

		const recon = await createRealStripeCustomerOnClock(ctx, {
			email: `${customerId}-r@example.com`,
			frozenTime: Date.now() - DAY * 10,
		});
		const subR = await createRealStripeSubOnClock(ctx, {
			customerId: recon.customerId,
			label: `${customerId}-r`,
		});
		await advanceClock(ctx, {
			testClockId: recon.testClockId,
			advanceTo: Date.now(),
		});
		const rAnchor = await periodEndMs(ctx, subR.subscriptionId);

		// Import only customer-level plan R. Entity A is not addressed.
		await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			processors: [{ type: "stripe", id: recon.customerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subR.subscriptionId },
					phases: [{ starts_at: "now", plans: [{ plan_id: planR.id }] }],
				},
			],
		});

		// P expired (customer-level), R active with its own real anchor.
		const productP = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planP.id,
		});
		expect(productP?.status).toBe(CusProductStatus.Expired);

		const productR = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planR.id,
		});
		expect(productR?.status).toBe(CusProductStatus.Active);
		expect(productR?.billing_cycle_anchor).toBe(rAnchor);

		// Entity-A Q untouched: still active with its original anchor.
		const productQ = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: planQ.id,
		});
		expect(productQ?.status).toBe(CusProductStatus.Active);
		expect(productQ?.internal_entity_id).toBe(entityAInternalId);
		expect(productQ?.billing_cycle_anchor).toBe(qAnchor);
	},
);
