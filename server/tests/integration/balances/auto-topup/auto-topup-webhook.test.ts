import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	AppEnv,
	type ApiCustomerV5,
	type BillingAutoTopupFailed,
	type BillingAutoTopupSucceeded,
	PurchaseLimitInterval,
	WebhookEventType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import {
	getPlayHistory,
	getTestSvixAppId,
	parseEventBody,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { autoTopup } from "@/internal/balances/autoTopUp/autoTopup.js";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig.js";

type AutoTopupSucceededPayload = {
	type: WebhookEventType.BillingAutoTopupSucceeded;
	id: string;
	occurred_at: number;
	data: BillingAutoTopupSucceeded;
};

type AutoTopupFailedPayload = {
	type: WebhookEventType.BillingAutoTopupFailed;
	id: string;
	occurred_at: number;
	data: BillingAutoTopupFailed;
};

let webhook: WebhookTestSetup;
let playToken: string;
const RUN_ID = Date.now();

const waitForAnyAutoTopupWebhook = async ({
	customerId,
	timeoutMs = 10_000,
}: {
	customerId: string;
	timeoutMs?: number;
}) =>
	waitForWebhook<AutoTopupSucceededPayload | AutoTopupFailedPayload>({
		token: playToken,
		predicate: (payload) =>
			(payload.type === WebhookEventType.BillingAutoTopupSucceeded ||
				payload.type === WebhookEventType.BillingAutoTopupFailed) &&
			payload.data?.customer_id === customerId,
		timeoutMs,
	});

const countAutoTopupFailedWebhooks = async ({
	customerId,
	reason,
}: {
	customerId: string;
	reason: BillingAutoTopupFailed["reason"];
}) => {
	const history = await getPlayHistory({ token: playToken });
	return history.data.reduce((count, event) => {
		try {
			const payload = parseEventBody<AutoTopupFailedPayload>(event);
			if (
				payload.type === WebhookEventType.BillingAutoTopupFailed &&
				payload.data?.customer_id === customerId &&
				payload.data?.reason === reason
			) {
				return count + 1;
			}
		} catch {
			return count;
		}
		return count;
	}, 0);
};

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: [
			WebhookEventType.BillingAutoTopupSucceeded,
			WebhookEventType.BillingAutoTopupFailed,
		],
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
	expect(data.invoice.status).toBe("open");
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

	const result = await waitForAnyAutoTopupWebhook({ customerId });

	expect(result).toBeNull();
}, 60_000);

test.concurrent(`${chalk.yellowBright("auto-topup webhook: dry run emits no webhook")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProduct = products.oneOffAddOn({
		id: `topup-webhook-dry-run-${RUN_ID}`,
		items: [oneOffItem],
		billingControls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	const { customerId } = await initScenario({
		customerId: `auto-topup-webhook-dry-run-${RUN_ID}`,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
			}),
		],
	});

	await autoTopup({
		ctx: {
			...ctx,
			org: {
				...ctx.org,
				config: {
					...ctx.org.config,
					dryrun_autotopups: true,
				},
			},
		},
		payload: {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		},
	});

	const result = await waitForAnyAutoTopupWebhook({ customerId });
	expect(result).toBeNull();
}, 60_000);

test.concurrent(`${chalk.yellowBright("auto-topup webhook: org disabled emits no webhook")}`, async () => {
	const customerId = `auto-topup-webhook-org-disabled-${RUN_ID}`;

	await autoTopup({
		ctx: {
			...ctx,
			env: AppEnv.Live,
			org: {
				...ctx.org,
				config: {
					...ctx.org.config,
					disabled_auto_topup: true,
				},
			},
		},
		payload: {
			orgId: ctx.org.id,
			env: AppEnv.Live,
			customerId,
			featureId: TestFeature.Messages,
		},
	});

	const result = await waitForAnyAutoTopupWebhook({ customerId });
	expect(result).toBeNull();
}, 60_000);

test.concurrent(`${chalk.yellowBright("auto-topup webhook: failed charge sends failure webhook")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProduct = products.oneOffAddOn({
		id: `topup-webhook-charge-failed-${RUN_ID}`,
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: `auto-topup-webhook-charge-failed-${RUN_ID}`,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
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

	const result = await waitForWebhook<AutoTopupFailedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === WebhookEventType.BillingAutoTopupFailed &&
			payload.data?.customer_id === customerId,
		timeoutMs: 30_000,
	});

	expect(result).not.toBeNull();
	const payload = result!.payload;
	expect(payload.id).toStartWith("evt_auto_topup_failed_");
	expect(payload.occurred_at).toBeGreaterThan(0);
	const data = payload.data;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.reason).toBe("charge_failed");
	expect(data.retryable).toBe(false);
	expect(data.quantity).toBe(100);
	expect(data.threshold).toBe(20);
	expect(data.balance).toBe(15);
	expect(data.invoice_mode).toBe(false);
	expect(data.invoice?.stripe_id).toStartWith("in_");
	expect(data.invoice?.status).toBe("void");
	expect(data.invoice?.total).toBe(1000);
	expect(data.invoice?.currency).toBe("usd");

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 15,
	});
}, 60_000);

test.concurrent(`${chalk.yellowBright("auto-topup webhook: limit block sends failure webhook")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProduct = products.oneOffAddOn({
		id: `topup-webhook-limit-failed-${RUN_ID}`,
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: `auto-topup-webhook-limit-failed-${RUN_ID}`,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 50,
			quantity: 100,
			purchaseLimit: {
				interval: PurchaseLimitInterval.Month,
				limit: 1,
			},
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 260,
	});

	const successResult = await waitForWebhook<AutoTopupSucceededPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === WebhookEventType.BillingAutoTopupSucceeded &&
			payload.data?.customer_id === customerId,
		timeoutMs: 30_000,
		logWebhook: false,
	});
	expect(successResult).not.toBeNull();

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const failedResult = await waitForWebhook<AutoTopupFailedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === WebhookEventType.BillingAutoTopupFailed &&
			payload.data?.customer_id === customerId,
		timeoutMs: 30_000,
	});

	expect(failedResult).not.toBeNull();
	const data = failedResult!.payload.data;
	expect(data.reason).toBe("purchase_limit_reached");
	expect(data.retryable).toBe(false);
	expect(data.quantity).toBe(100);
	expect(data.threshold).toBe(50);
	expect(data.balance).toBe(40);
	expect(data.invoice).toBeNull();

	const failureCountAfterFirstBlock = await countAutoTopupFailedWebhooks({
		customerId,
		reason: "purchase_limit_reached",
	});
	expect(failureCountAfterFirstBlock).toBe(1);

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1,
	});
	await timeout(10_000);

	const failureCountAfterSecondBlock = await countAutoTopupFailedWebhooks({
		customerId,
		reason: "purchase_limit_reached",
	});
	expect(failureCountAfterSecondBlock).toBe(1);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 39,
	});
}, 90_000);
