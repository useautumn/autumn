/**
 * Auto top-ups must not keep charging payment methods that settle days later.
 *
 * Red (before the fix):
 *  - delay1: an ACH default is charged; no `payment_method_not_supported` webhook
 *  - delay2: a `processing` charge isn't suspended and fires `auto_topup_succeeded`;
 *    settlement (`invoice.paid`) would clear any suspension
 *  - delay3: no delayed-payment suspension exists to be lifted by a new card
 *
 * Green: delayed types are denied before charging; a charge that still comes back
 * `processing` suspends the customer+feature until a new payment method is added.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	autoTopupLimitStates,
	type BillingAutoTopupFailed,
	WebhookEventType,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
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
import defaultCtx, {
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { autoTopup } from "@/internal/balances/autoTopUp/autoTopup.js";
import { DELAYED_PAYMENT_METHOD_TYPES } from "@/internal/balances/autoTopUp/helpers/delayedPaymentMethods.js";
import { CusService } from "@/internal/customers/CusService.js";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer.js";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig.js";

const AUTO_TOPUP_WAIT_MS = 20000;
const ACH_SETTLE_TIMEOUT_MS = 180000;
const RUN_ID = Date.now();

type AutoTopupWebhookPayload = {
	type: WebhookEventType;
	data: BillingAutoTopupFailed;
};

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: defaultCtx.org.svix_config }),
		filterTypes: [
			WebhookEventType.BillingAutoTopupSucceeded,
			WebhookEventType.BillingAutoTopupFailed,
		],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

const countAutoTopupWebhooks = async ({
	customerId,
	type,
	reason,
}: {
	customerId: string;
	type: WebhookEventType;
	reason?: BillingAutoTopupFailed["reason"];
}) => {
	const history = await getPlayHistory({ token: webhook.playToken });
	return history.data.filter((event) => {
		try {
			const payload = parseEventBody<AutoTopupWebhookPayload>(event);
			return (
				payload.type === type &&
				payload.data?.customer_id === customerId &&
				(reason === undefined || payload.data?.reason === reason)
			);
		} catch {
			return false;
		}
	}).length;
};

/** Polls Svix Play: delivery lands a few seconds after the job fires it. */
const expectAutoTopupFailedWebhook = async ({
	customerId,
	reason,
}: {
	customerId: string;
	reason: BillingAutoTopupFailed["reason"];
}) => {
	const received = await waitForWebhook<AutoTopupWebhookPayload>({
		token: webhook.playToken,
		predicate: (payload) =>
			payload.type === WebhookEventType.BillingAutoTopupFailed &&
			payload.data?.customer_id === customerId &&
			payload.data?.reason === reason,
		timeoutMs: 30000,
	});
	expect(received).not.toBeNull();
};

const getLimitState = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const [state] = await ctx.db
		.select()
		.from(autoTopupLimitStates)
		.where(
			and(
				eq(autoTopupLimitStates.org_id, ctx.org.id),
				eq(autoTopupLimitStates.env, ctx.env),
				eq(autoTopupLimitStates.customer_id, customerId),
				eq(autoTopupLimitStates.feature_id, TestFeature.Messages),
			),
		);
	return state;
};

/** Reopens the sliding attempt windows so only the suspension can block. */
const expireAutoTopupWindows = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const expired = Date.now() - 1;
	await ctx.db
		.update(autoTopupLimitStates)
		.set({
			attempt_window_ends_at: expired,
			attempt_count: 0,
			failed_attempt_window_ends_at: expired,
			failed_attempt_count: 0,
		})
		.where(
			and(
				eq(autoTopupLimitStates.org_id, ctx.org.id),
				eq(autoTopupLimitStates.env, ctx.env),
				eq(autoTopupLimitStates.customer_id, customerId),
			),
		);
};

/** Runs the job in-process, bypassing the dispatch gate the earlier track left closed. */
const runAutoTopupInProcess = ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) =>
	autoTopup({
		ctx,
		payload: {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId: TestFeature.Messages,
		},
	});

/** Lifts the pre-charge deny list so the `processing` branch runs as for an undocumented slow type. */
const runAutoTopupPastDenyList = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const denied = [...DELAYED_PAYMENT_METHOD_TYPES];
	DELAYED_PAYMENT_METHOD_TYPES.clear();
	try {
		await runAutoTopupInProcess({ ctx, customerId });
	} finally {
		for (const type of denied) DELAYED_PAYMENT_METHOD_TYPES.add(type);
	}
};

const swapToCard = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripeCusId = customer?.processor?.id;
	if (!stripeCusId) throw new Error(`No Stripe customer for ${customerId}`);

	const existing = await ctx.stripeCli.paymentMethods.list({
		customer: stripeCusId,
	});
	for (const paymentMethod of existing.data) {
		await ctx.stripeCli.paymentMethods.detach(paymentMethod.id);
	}
	await attachPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCusId,
		type: "success",
	});
};

/** Attach with a card, then make an ACH test account the default PM. */
const setupAchCustomer = async ({
	id,
	achType,
}: {
	id: string;
	achType: "us_bank_account" | "us_bank_account_processing";
}) => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: `topup-${id}-${RUN_ID}`,
		items: [oneOffItem],
	});

	const scenario = await initScenario({
		customerId: `auto-topup-${id}-${RUN_ID}`,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: achType }),
		],
	});

	await scenario.autumnV2_1.customers.update(scenario.customerId, {
		billing_controls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
	});

	return scenario;
};

/** Drops the balance to 15 and lets the dispatched job run. */
const dropBelowThreshold = async ({
	autumnV2_1,
	customerId,
}: Awaited<ReturnType<typeof setupAchCustomer>>) => {
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);
};

test(`${chalk.yellowBright("auto-topup delay1: ACH default is not charged and gets payment_method_not_supported")}`, async () => {
	const scenario = await setupAchCustomer({
		id: "delay1",
		achType: "us_bank_account_processing",
	});
	const { customerId } = scenario;

	await dropBelowThreshold(scenario);

	await expectCustomerInvoiceCorrect({ customerId, count: 1 });
	await expectAutoTopupFailedWebhook({
		customerId,
		reason: "payment_method_not_supported",
	});
});

test(`${chalk.yellowBright("auto-topup delay2: processing charge suspends, blocks the next top-up, and stays suspended after it settles")}`, async () => {
	const scenario = await setupAchCustomer({
		id: "delay2",
		achType: "us_bank_account",
	});
	const { customerId, autumnV2_1, ctx } = scenario;

	await dropBelowThreshold(scenario);
	await runAutoTopupPastDenyList({ ctx, customerId });

	// One charge, still processing: suspended under its own reason, no success webhook.
	await expectCustomerInvoiceCorrect({ customerId, count: 2 });
	const suspended = await getLimitState({ ctx, customerId });
	expect(suspended?.suspended_at).not.toBeNull();
	expect(suspended?.suspended_reason).toBe("delayed_payment_method");
	await expectAutoTopupFailedWebhook({
		customerId,
		reason: "payment_method_delayed",
	});
	expect(
		await countAutoTopupWebhooks({
			customerId,
			type: WebhookEventType.BillingAutoTopupSucceeded,
		}),
	).toBe(0);

	// The next attempt doesn't charge, even with every rate-limit window open.
	await expireAutoTopupWindows({ ctx, customerId });
	await runAutoTopupPastDenyList({ ctx, customerId });
	await expectCustomerInvoiceCorrect({ customerId, count: 2 });

	// Settlement grants the credits but must not lift the suspension.
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestStatus: "paid",
		settleTimeoutMs: ACH_SETTLE_TIMEOUT_MS,
	});
	await timeout(10000);
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 115,
	});
	const afterSettle = await getLimitState({ ctx, customerId });
	expect(afterSettle?.suspended_at).not.toBeNull();
	expect(afterSettle?.suspended_reason).toBe("delayed_payment_method");
});

test(`${chalk.yellowBright("auto-topup delay3: adding a card lifts the delayed-payment suspension and the next top-up charges")}`, async () => {
	const scenario = await setupAchCustomer({
		id: "delay3",
		achType: "us_bank_account_processing",
	});
	const { customerId, ctx } = scenario;

	await dropBelowThreshold(scenario);
	await runAutoTopupPastDenyList({ ctx, customerId });
	const suspended = await getLimitState({ ctx, customerId });
	expect(suspended?.suspended_reason).toBe("delayed_payment_method");

	await swapToCard({ ctx, customerId });
	await expireAutoTopupWindows({ ctx, customerId });
	await runAutoTopupInProcess({ ctx, customerId });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: 10,
		latestStatus: "paid",
	});
	const lifted = await getLimitState({ ctx, customerId });
	expect(lifted?.suspended_at).toBeNull();
});

test(`${chalk.yellowBright("auto-topup delay4: switching to invoice mode tops up despite a delayed-payment suspension")}`, async () => {
	const scenario = await setupAchCustomer({
		id: "delay4",
		achType: "us_bank_account_processing",
	});
	const { customerId, autumnV2_1, ctx } = scenario;

	await dropBelowThreshold(scenario);
	await runAutoTopupPastDenyList({ ctx, customerId });
	const suspended = await getLimitState({ ctx, customerId });
	expect(suspended?.suspended_reason).toBe("delayed_payment_method");

	// Invoice mode never charges the saved method, so the suspension must not block it.
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			invoiceMode: true,
		}),
	});
	await expireAutoTopupWindows({ ctx, customerId });
	await runAutoTopupInProcess({ ctx, customerId });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: 10,
		latestStatus: "open",
	});
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 115,
	});
});
