/**
 * Tests for default_applies_to_entities org config behavior.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	customerProducts,
	FreeTrialDuration,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getEntitySubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron";
import { db } from "@/db/initDrizzle";
import { logger } from "@/external/logtail/logtailUtils";
import { CusService } from "@/internal/customers/CusService";
import { OrgService } from "@/internal/orgs/OrgService";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Default applies to entities
// ═══════════════════════════════════════════════════════════════════════════════

describe("default applies to entities", () => {
	beforeAll(async () => {
		await OrgService.update({
			db: db,
			orgId: defaultCtx.org.id,
			updates: {
				config: {
					...defaultCtx.org.config,
					default_applies_to_entities: true,
				},
			},
		});
	});

	afterAll(async () => {
		await OrgService.update({
			db: db,
			orgId: defaultCtx.org.id,
			updates: {
				config: {
					...defaultCtx.org.config,
					default_applies_to_entities: false,
				},
			},
		});
	});

	test.concurrent(`${chalk.yellowBright("default applies to entities 1")}`, async () => {
		const customerId = "default-applies-to-entities";

		const consumableMessagesItem = items.monthlyMessages({
			includedUsage: 100,
		});

		const free = products.base({
			id: "free",
			isDefault: true,
			items: [consumableMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			notPresent: [free.id],
		});

		await autumnV1.entities.create(customerId, {
			id: "user1",
			name: "User 1",
			feature_id: TestFeature.Users,
			customer_data: {
				internal_options: {
					default_group: customerId,
				},
			},
		});

		const entity = await autumnV1.entities.get(customerId, "user1");
		await expectCustomerProducts({
			customer: entity,
			active: [free.id],
		});
	});

	test(`${chalk.yellowBright("default applies to entities 2: product cron expires trial and activates default")}`, async () => {
		const customerId = "cron-default-entity";

		const monthlyMessages = items.monthlyMessages({
			includedUsage: 100,
		});

		const free = products.base({
			id: "free",
			isDefault: true,
			items: [monthlyMessages],
		});

		const proTrial = products.base({
			id: "pro-trial",
			items: [monthlyMessages],
			freeTrial: {
				length: 7,
				duration: FreeTrialDuration.Day,
			},
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, proTrial] }),
				s.entities({
					count: 1,
					featureId: TestFeature.Users,
					defaultGroup: customerId,
				}),
			],
			actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
		});

		const entityBefore = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entityBefore,
			active: [proTrial.id],
		});

		const fullCustomer = await CusService.getFull({
			ctx: defaultCtx,
			idOrInternalId: customerId,
			withEntities: true,
		});

		const trialCusProduct = fullCustomer.customer_products.find(
			(cp) => cp.product_id === proTrial.id && cp.entity_id === entities[0].id,
		);
		expect(trialCusProduct).toBeDefined();

		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialCusProduct!.id));

		await runProductCron({ ctx: { db, logger } });

		const entityAfter = await autumnV1.entities.get(customerId, entities[0].id);
		await expectCustomerProducts({
			customer: entityAfter,
			active: [free.id],
			notPresent: [proTrial.id],
		});
	});

	test(`${chalk.yellowBright("default applies to entities 3: cancel end of cycle schedules free on entity")}`, async () => {
		const customerId = "cancel-eoc-entity-default";

		const monthlyMessages = items.monthlyMessages({
			includedUsage: 100,
		});

		const free = products.base({
			id: "free",
			isDefault: true,
			items: [monthlyMessages],
		});

		const pro = products.pro({
			id: "pro",
			items: [monthlyMessages],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
				s.entities({
					count: 2,
					featureId: TestFeature.Users,
					defaultGroup: customerId,
				}),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		const entity1Before = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entity1Before,
			active: [pro.id],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_end_of_cycle",
		});

		const entity1After = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entity1After,
			canceling: [pro.id],
			scheduled: [free.id],
		});

		const entity2After = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		await expectCustomerProducts({
			customer: entity2After,
			active: [pro.id],
		});
	});

	test(`${chalk.yellowBright("default applies to entities 4: stripe cancel schedules free on entity")}`, async () => {
		const customerId = "stripe-cancel-entity-default";

		const monthlyMessages = items.monthlyMessages({
			includedUsage: 100,
		});

		const free = products.base({
			id: "free",
			isDefault: true,
			items: [monthlyMessages],
		});

		const pro = products.pro({
			id: "pro",
			items: [monthlyMessages],
		});

		const { autumnV1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
				s.entities({
					count: 1,
					featureId: TestFeature.Users,
					defaultGroup: customerId,
				}),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const entityBefore = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entityBefore,
			active: [pro.id],
		});

		const subscriptionId = await getEntitySubscriptionId({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: pro.id,
		});

		await ctx.stripeCli.subscriptions.cancel(subscriptionId);

		await timeout(12000);

		const entityAfter = await autumnV1.entities.get(customerId, entities[0].id);
		await expectCustomerProducts({
			customer: entityAfter,
			active: [free.id],
			notPresent: [pro.id],
		});
	});
});
