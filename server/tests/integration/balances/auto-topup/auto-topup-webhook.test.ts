import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type BillingAutoTopupSucceeded,
	WebhookEventType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
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
import { Decimal } from "decimal.js";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig.js";

type AutoTopupSucceededPayload = {
	type: WebhookEventType.BillingAutoTopupSucceeded;
	id: string;
	occurred_at: number;
	data: BillingAutoTopupSucceeded;
};

let webhook: WebhookTestSetup;
let playToken: string;
const RUN_ID = Date.now();

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: [WebhookEventType.BillingAutoTopupSucceeded],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test.concurrent(`${chalk.yellowBright("auto-topup webhook: successful auto top-up sends webhook")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProduct = products.oneOffAddOn({
		id: `topup-webhook-success-${RUN_ID}`,
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: `auto-topup-webhook-success-${RUN_ID}`,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	const result = await waitForWebhook<AutoTopupSucceededPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === WebhookEventType.BillingAutoTopupSucceeded &&
			payload.data?.customer_id === customerId,
		timeoutMs: 30_000,
	});

	expect(result).not.toBeNull();
	const payload = result!.payload;
	expect(payload.id).toStartWith("evt_auto_topup_");
	expect(payload.occurred_at).toBeGreaterThan(0);
	const data = payload.data;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.quantity_granted).toBe(100);
	expect(data.threshold).toBe(20);
	expect(data.balance_after).toBe(new Decimal(100).sub(85).add(100).toNumber());
	expect(data.invoice_mode).toBe(false);
	expect(data.invoice.status).toBe("paid");
	expect(data.invoice.stripe_id).toStartWith("in_");
	expect(data.invoice.total).toBe(1000);
	expect(data.invoice.currency).toBe("usd");

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: new Decimal(100).sub(85).add(100).toNumber(),
	});
}, 60_000);

test.concurrent(`${chalk.yellowBright("auto-topup webhook: invoice mode fires with open invoice")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProduct = products.oneOffAddOn({
		id: `topup-webhook-invoice-mode-${RUN_ID}`,
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: `auto-topup-webhook-invoice-mode-${RUN_ID}`,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			invoiceMode: true,
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	const result = await waitForWebhook<AutoTopupSucceededPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === WebhookEventType.BillingAutoTopupSucceeded &&
			payload.data?.customer_id === customerId,
		timeoutMs: 30_000,
	});

	expect(result).not.toBeNull();
	const data = result!.payload.data;
	expect(data.invoice_mode).toBe(true);
	expect(data.invoice.status).not.toBe("void");
	expect(data.invoice.status).not.toBe("paid");
	expect(data.balance_after).toBe(new Decimal(100).sub(85).add(100).toNumber());
}, 60_000);

test.concurrent(`${chalk.yellowBright("auto-topup webhook: no webhook when balance remains above threshold")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProduct = products.oneOffAddOn({
		id: `topup-webhook-no-fire-${RUN_ID}`,
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: `auto-topup-webhook-no-fire-${RUN_ID}`,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	const result = await waitForWebhook<AutoTopupSucceededPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === WebhookEventType.BillingAutoTopupSucceeded &&
			payload.data?.customer_id === customerId,
		timeoutMs: 10_000,
	});

	expect(result).toBeNull();
}, 60_000);
