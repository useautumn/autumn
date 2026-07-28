/** Regression: carry_over_balances must preserve each entity's non-zero balance independently.
 * Negative balances remain debts on their originating entity. */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { updateCusEntDbAndCache } from "@/internal/customers/cusProducts/cusEnts/actions/updateCusEntDbAndCache";

test.concurrent(`${chalk.yellowBright("carry-over-balance-per-entity 1: positive and negative balances carry independently")}`, async () => {
	const proMessages = items.monthlyMessages({
		includedUsage: 200,
		entityFeatureId: TestFeature.Users,
	});
	const premiumMessages = items.monthlyMessages({
		includedUsage: 300,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1, entities, ctx } = await initScenario({
		customerId: "carry-over-balance-per-entity1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, timeout: 4000 })],
	});

	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEnt).toBeDefined();

	const entityBalances = structuredClone(cusEnt!.entities!);
	entityBalances[entities[0].id].balance = -50;
	await updateCusEntDbAndCache({
		ctx,
		customerId,
		cusEntId: cusEnt!.id,
		featureId: TestFeature.Messages,
		updates: { entities: entityBalances },
		incrementCacheVersion: false,
	});

	const e1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: e1Before,
		featureId: TestFeature.Messages,
		balance: -50,
		usage: 250,
	});

	const e2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: e2Before,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
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
		balance: 250,
		usage: 0,
	});

	const e2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: e2After,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 750,
		usage: 0,
	});
});
