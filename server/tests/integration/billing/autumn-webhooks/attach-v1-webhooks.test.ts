import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0, ApiProduct } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: string;
		customer: ApiCustomerV3;
		updated_product: ApiProduct;
		entity?: ApiEntityV0;
	};
};

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["customer.products.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test.concurrent(`${chalk.yellowBright("webhook v1: upgrade Pro -> Premium - scenario: upgrade")}`, async () => {
	const customerId = "webhook-v1-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "upgrade" &&
			payload.data?.updated_product?.id === premium.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("upgrade");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: premium.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: downgrade Premium -> Pro - scenario: downgrade")}`, async () => {
	const customerId = "webhook-v1-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "downgrade" &&
			payload.data?.updated_product?.id === premium.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("downgrade");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: cancel to free Premium -> Free - scenario: cancel")}`, async () => {
	const customerId = "webhook-v1-cancel-to-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [free, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel" &&
			payload.data?.updated_product?.id === premium.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("cancel");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: free.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: uncancel via attach Pro -> (cancel) -> Pro - scenario: renew")}`, async () => {
	const customerId = "webhook-v1-uncancel-attach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: pro.id });

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "renew" &&
			payload.data?.updated_product?.id === pro.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("renew");
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: entity upgrade Pro -> Premium - scenario: upgrade")}`, async () => {
	const customerId = "webhook-v1-entity-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entityId,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "upgrade" &&
			payload.data?.updated_product?.id === premium.id &&
			payload.data?.entity?.id === entityId,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("upgrade");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeDefined();
	expect(data.entity?.id).toBe(entityId);

	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	await expectProductActive({ customer: entity, productId: premium.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: entity downgrade Premium -> Pro - scenario: downgrade")}`, async () => {
	const customerId = "webhook-v1-entity-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: premium.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "downgrade" &&
			payload.data?.updated_product?.id === premium.id &&
			payload.data?.entity?.id === entityId,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("downgrade");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeDefined();
	expect(data.entity?.id).toBe(entityId);

	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	await expectProductCanceling({ customer: entity, productId: premium.id });
	await expectProductScheduled({ customer: entity, productId: pro.id });
});
