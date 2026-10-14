import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("scheduled-switch-per-entity 1: premium to pro with per-entity consumable messages (usage resets)")}`, async () => {
	const customerId = "sched-switch-pe-cons-premium-to-pro";

	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages],
	});

	const proPerEntityMessages = items.consumableMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPerEntityMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, timeout: 4000 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 300,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 500,
				entityIndex: 1,
				timeout: 2000,
			}),
			s.billing.attach({ productId: pro.id }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("scheduled-switch-per-entity 2: premium to free with per-entity consumable + FREE allocated (mixed behavior)")}`, async () => {
	const customerId = "sched-switch-pe-mixed-premium-to-free";

	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users,
	});
	const premiumPerEntityWorkflows = items.freeAllocatedWorkflows({
		includedUsage: 10,
		entityFeatureId: TestFeature.Users,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages, premiumPerEntityWorkflows],
	});

	const freePerEntityMessages = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const freePerEntityWorkflows = items.freeAllocatedWorkflows({
		includedUsage: 2,
		entityFeatureId: TestFeature.Users,
	});
	const free = products.base({
		id: "free",
		items: [freePerEntityMessages, freePerEntityWorkflows],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, timeout: 4000 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 300,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 500,
				entityIndex: 1,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Workflows,
				value: 5,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Workflows,
				value: 8,
				entityIndex: 1,
				timeout: 2000,
			}),
			s.billing.attach({ productId: free.id }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [free.id],
		notPresent: [premium.id],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Workflows,
		includedUsage: 2,
		balance: -3,
		usage: 5,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Workflows,
		includedUsage: 2,
		balance: -6,
		usage: 8,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Workflows,
		includedUsage: 4,
		balance: -9,
		usage: 13,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 0,
		latestInvoiceProductIds: [],
	});
});

test.concurrent(`${chalk.yellowBright("scheduled-switch-per-entity 3: downgrade with overage - billed at cycle end")}`, async () => {
	const customerId = "sched-switch-pe-overage-downgrade";

	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages],
	});

	const proPerEntityMessages = items.consumableMessages({
		includedUsage: 50,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPerEntityMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, timeout: 4000 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 130,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 150,
				entityIndex: 1,
				timeout: 2000,
			}),
			s.billing.attach({ productId: pro.id }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 28,
	});
});
