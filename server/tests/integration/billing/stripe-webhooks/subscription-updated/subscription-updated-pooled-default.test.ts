import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import testCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../../pooled-balances/utils/getPooledBalanceDbState";

type BillingUpdatedPayload = {
	type: string;
	data: {
		customer_id: string;
		plan_changes: { action: string; subscription: { plan_id: string } }[];
	};
};

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: testCtx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(`${chalk.yellowBright("sub.updated: a pooled plan ending at a phase change into an inserted default finishes the webhook")}`, async () => {
	const customerId = "sub-updated-pooled-default";
	const group = `${customerId}-group`;

	const free = products.base({
		id: "free",
		group,
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});
	const pro = products.pro({
		id: "pro",
		group,
		items: [{ ...items.monthlyMessages({ includedUsage: 100 }), pooled: true }],
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyUsers({ includedUsage: 5 })],
	});

	const { autumnV1, autumnV2_3, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, addon] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: addon.id }),
		],
	});

	await autumnV2_3.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});
	await autumnV1.products.update(free.id, { is_default: true });

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const billingUpdated = await waitForWebhook<BillingUpdatedPayload>({
		token: webhook.playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data.customer_id === customerId &&
			payload.data.plan_changes.some(
				(change) =>
					change.action === "expired" && change.subscription.plan_id === pro.id,
			),
		timeoutMs: 30000,
	});
	expect(billingUpdated).not.toBeNull();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		notPresent: [pro.id],
		active: [free.id, addon.id],
	});

	const afterPhaseChange = await getPooledBalanceDbState({
		db: ctx.db,
		customerId,
	});
	expect(afterPhaseChange.contributions).toHaveLength(0);
	expect(afterPhaseChange.pools).toHaveLength(1);
	expect(afterPhaseChange.pools[0].expires_at).not.toBeNull();
});
