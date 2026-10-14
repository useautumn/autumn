import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type LimitedItem,
	ProductItemInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { warmEntityCaches } from "@tests/integration/balances/utils/warmEntityCaches.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireAllCusEntsForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

test.concurrent(`${chalk.yellowBright("customer aggregated balance: rollover balance + usage propagate across reset and deduction")}`, async () => {
	const rolloverConfig = {
		max: 500,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const messagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Month,
		entityFeatureId: TestFeature.Users,
		rolloverConfig,
	}) as LimitedItem;

	const base = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2_2, ctx, entities } =
		await initScenario({
			customerId: "customer-agg-rollovers",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [base] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: base.id })],
		});

	await warmEntityCaches({ autumn: autumnV2_2, customerId, entities });

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 60,
	}, { timeout: 2000 });
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 30,
	}, { timeout: 2000 });

	await warmEntityCaches({ autumn: autumnV2_2, customerId, entities });

	const preReset = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: preReset,
		featureId: TestFeature.Messages,
		remaining: 110,
		usage: 90,
	});

	const preResetDb = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: preResetDb,
		featureId: TestFeature.Messages,
		remaining: 110,
		usage: 90,
	});

	await expireAllCusEntsForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	await warmEntityCaches({ autumn: autumnV2_2, customerId, entities });

	const postReset = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: postReset,
		featureId: TestFeature.Messages,
		remaining: 310,
		usage: 0,
	});

	const postResetDb = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{ skip_cache: "true" },
	);
	expectBalanceCorrect({
		customer: postResetDb,
		featureId: TestFeature.Messages,
		remaining: 310,
		usage: 0,
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await warmEntityCaches({ autumn: autumnV2_2, customerId, entities });

	const postDeduct = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: postDeduct,
		featureId: TestFeature.Messages,
		remaining: 260,
		usage: 50,
	});
});
