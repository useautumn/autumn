import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

test.concurrent(`${chalk.yellowBright("cache-race: concurrent webhook delete + stale re-population during billing.update leaves correct balance after 200")}`, async () => {
	const customerId = "billing-update-cache-race";
	const initialQuantity = 250;
	const updatedQuantity = 1500;

	const product = products.base({
		id: "ai-credits-plan",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 1,
				price: 1,
				includedUsage: 0,
			}),
		],
	});

	const { autumnV1, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		balance: initialQuantity,
		usage: 0,
	});

	await Promise.all([
		autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: updatedQuantity },
			],
			recalculate_balances: { enabled: true },
		}),

		(async () => {
			await timeout(3000);

			await deleteCachedFullCustomer({
				customerId,
				ctx,
				source: "simulated-stripe-webhook",
				skipGuard: true,
			});

			await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		})(),
	]);

	const customerCached =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});

	console.log(
		`[cache-race] cached balance: ${customerCached.features[TestFeature.Messages]?.balance} | db balance: ${customerDb.features[TestFeature.Messages]?.balance} | expected: ${updatedQuantity}`,
	);

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		balance: updatedQuantity,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("cache-race: billing.update with recalculate_balances reflects new balance in cache (no race)")}`, async () => {
	const customerId = "billing-update-no-cache-race";
	const initialQuantity = 250;
	const updatedQuantity = 1500;

	const product = products.base({
		id: "ai-credits-plan",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 1,
				price: 1,
				includedUsage: 0,
			}),
		],
	});

	const { autumnV1, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: product.id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: updatedQuantity },
		],
		recalculate_balances: { enabled: true },
	});

	const customerCached =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});

	console.log(
		`[no-race] cached balance: ${customerCached.features[TestFeature.Messages]?.balance} | db balance: ${customerDb.features[TestFeature.Messages]?.balance} | expected: ${updatedQuantity}`,
	);

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		balance: updatedQuantity,
		usage: 0,
	});
});
