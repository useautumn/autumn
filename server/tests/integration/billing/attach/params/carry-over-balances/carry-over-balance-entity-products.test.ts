import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("carry-over-balance-entity-products 1: balance carried for upgraded entity only, other entity unchanged")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 300 });

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1, entities } = await initScenario({
		customerId: "carry-over-balance-entity-products1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0, timeout: 4000 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
		],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
		entity_id: entities[0].id,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
		entity_id: entities[1].id,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const e1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: e1Before,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 50,
	});

	const e2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: e2Before,
		featureId: TestFeature.Messages,
		balance: 70,
		usage: 30,
	});

	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		entity_id: entities[0].id,
		carry_over_balances: { enabled: true },
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const e1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: e1After,
		featureId: TestFeature.Messages,
		balance: 350,
		usage: 0,
	});

	const e2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: e2After,
		featureId: TestFeature.Messages,
		balance: 70,
		usage: 30,
	});
});
