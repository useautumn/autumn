import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	PurchaseLimitInterval,
	schemas,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { eq } from "drizzle-orm";
import { autoTopupLimitRepo } from "@/internal/balances/autoTopUp/repos";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig";

const AUTO_TOPUP_WAIT_MS = 20000;

const getAutoTopupLimitState = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	internalCustomerId: string;
}) => {
	return await autoTopupLimitRepo.findByScope({
		ctx,
		internalCustomerId,
		featureId: TestFeature.Messages,
	});
};

test.concurrent(`${chalk.yellowBright("auto-topup limits: attempt window blocks top-up after limit")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-limits-window",
		items: [oneOffItem],
	});

	const uniqueCustomerId = `auto-topup-attempt-limits`;
	const { customerId, autumnV2_1, ctx, customer } = await initScenario({
		customerId: uniqueCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
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
				limit: 2,
			},
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 260,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedMid = new Decimal(300).sub(260).add(100).toNumber();
	expectBalanceCorrect({
		customer: mid,
		featureId: TestFeature.Messages,
		remaining: expectedMid,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after2 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedAfter2 = new Decimal(140).sub(100).add(100).toNumber();
	expectBalanceCorrect({
		customer: after2,
		featureId: TestFeature.Messages,
		remaining: expectedAfter2,
	});

	expect(Boolean(customer?.internal_id)).toBe(true);
	const stateBeforeReset = await getAutoTopupLimitState({
		ctx,
		internalCustomerId: customer?.internal_id || "",
	});
	expect(stateBeforeReset).toBeDefined();
	expect(stateBeforeReset?.purchase_count).toBe(2);

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after3 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: after3,
		featureId: TestFeature.Messages,
		remaining: expectedAfter2 - 100,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup limits: purchase window reset allows new top-up after expiry")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-limits-window",
		items: [oneOffItem],
	});

	const uniqueCustomerId = `auto-topup-limits-window`;
	const { customerId, autumnV2_1, ctx, customer } = await initScenario({
		customerId: uniqueCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
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
				limit: 2,
			},
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 260,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedMid = new Decimal(300).sub(260).add(100).toNumber();
	expectBalanceCorrect({
		customer: mid,
		featureId: TestFeature.Messages,
		remaining: expectedMid,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after2 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedAfter2 = new Decimal(140).sub(100).add(100).toNumber();
	expectBalanceCorrect({
		customer: after2,
		featureId: TestFeature.Messages,
		remaining: expectedAfter2,
	});

	expect(Boolean(customer?.internal_id)).toBe(true);
	const stateBeforeReset = await getAutoTopupLimitState({
		ctx,
		internalCustomerId: customer?.internal_id || "",
	});
	expect(stateBeforeReset).toBeDefined();
	expect(stateBeforeReset?.purchase_count).toBe(2);

	const forceExpireNow = Date.now();
	await ctx.db
		.update(schemas.autoTopupLimits)
		.set({
			purchase_window_ends_at: forceExpireNow - 1_000,
			updated_at: forceExpireNow,
			attempt_window_ends_at: forceExpireNow - 1_000,
		})
		.where(eq(schemas.autoTopupLimits.id, stateBeforeReset?.id || ""));

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after3 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedAfter3 = new Decimal(140).sub(100).add(100).toNumber();
	expectBalanceCorrect({
		customer: after3,
		featureId: TestFeature.Messages,
		remaining: expectedAfter3,
	});

	const stateAfterReset = await getAutoTopupLimitState({
		ctx,
		internalCustomerId: customer?.internal_id || "",
	});
	expect(stateAfterReset).toBeDefined();
	expect(stateAfterReset?.purchase_count).toBe(1);
	expect((stateAfterReset?.purchase_window_ends_at || 0) > Date.now()).toBe(
		true,
	);
});

test.concurrent(`${chalk.yellowBright("auto-topup limits: failed payment increments failed attempt count and voids invoice")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-limits-failed",
		items: [oneOffItem],
	});

	const uniqueCustomerId = `auto-topup-limits-fail-${Date.now()}`;
	const { customerId, autumnV2_1, ctx, customer } = await initScenario({
		customerId: uniqueCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
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

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 15,
	});

	expect(Boolean(customer?.internal_id)).toBe(true);
	const stateAfterFail = await getAutoTopupLimitState({
		ctx,
		internalCustomerId: customer?.internal_id || "",
	});
	expect(stateAfterFail).toBeDefined();
	expect((stateAfterFail?.failed_attempt_count || 0) >= 1).toBe(true);
	expect((stateAfterFail?.attempt_count || 0) >= 1).toBe(true);
	expect((stateAfterFail?.last_failed_attempt_at || 0) > 0).toBe(true);

	const stripeCustomerId = customer?.processor?.id;
	expect(Boolean(stripeCustomerId)).toBe(true);
	const stripeInvoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId || "",
		limit: 5,
	});
	expect(stripeInvoices.data.length > 0).toBe(true);
	expect(stripeInvoices.data[0].status).toBe("void");
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: rate limit (max_purchases) blocks after limit")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
		],
	});

	// Configure auto top-up with purchase_limit = 2 per month
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

	// Starting balance: 300

	// Round 1: Track 260 → balance = 40 → top-up fires (purchase 1) → balance = 140
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 260,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after1 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const balance1 = after1.balances[TestFeature.Messages].remaining;
	const expected1 = new Decimal(300).sub(260).add(100).toNumber();
	expect(balance1).toBe(expected1); // 140

	// Round 2: Track 100 → balance = 40 → top-up fires (purchase 2) → balance = 140
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after2 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const balance2 = after2.balances[TestFeature.Messages].remaining;
	expect(balance2).toBe(balance1 - 100); // 40

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: oneOffProd.id,
	});
});
