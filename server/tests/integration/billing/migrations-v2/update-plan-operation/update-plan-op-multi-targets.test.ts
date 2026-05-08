/**
 * TDD coverage for update_plan multi-target migrations.
 *
 * Contract under test:
 *   - plan_filter can match multiple customer products on different entities.
 *   - multiple update_plan operations run in order on the same customer.
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV2 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_plan: plan filter patches multiple entity products")}`, async () => {
	const customerId = "migration-update-multi-entity";
	const pro = products.pro({ items: [] });

	const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						add_items: [
							itemsV2.dashboard(),
							itemsV2.monthlyWords({ included: 75 }),
						],
					},
				},
			],
		},
	});

	const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);

	for (const entity of [entity1, entity2]) {
		expectFlagCorrect({
			customer: entity,
			featureId: TestFeature.Dashboard,
			planId: pro.id,
		});
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Words,
			remaining: 75,
			usage: 0,
			planId: pro.id,
		});
	}

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
	});
	await expectNoExpiredCustomerProducts({
		ctx,
		customerId,
		productId: pro.id,
		entityId: entities[0].id,
	});
	await expectNoExpiredCustomerProducts({
		ctx,
		customerId,
		productId: pro.id,
		entityId: entities[1].id,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: two operations run in order")}`, async () => {
	const customerId = "migration-update-two-ops";
	const pro = products.pro({ items: [] });
	const premium = products.premium({
		items: [items.monthlyCredits({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: {
			customer: {
				plan: { $or: [{ plan_id: pro.id }, { plan_id: premium.id }] },
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
				{
					type: "update_plan",
					plan_filter: { plan_id: premium.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Credits }],
						add_items: [
							{
								feature_id: TestFeature.Credits,
								included: 250,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				},
			],
		},
	});

	const proEntity = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	const premiumEntity = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);

	expectFlagCorrect({
		customer: proEntity,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer: premiumEntity,
		featureId: TestFeature.Credits,
		remaining: 250,
		usage: 0,
		planId: premium.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
	});
	await expectNoExpiredCustomerProducts({
		ctx,
		customerId,
		productId: pro.id,
		entityId: entities[0].id,
	});
	await expectNoExpiredCustomerProducts({
		ctx,
		customerId,
		productId: premium.id,
		entityId: entities[1].id,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
