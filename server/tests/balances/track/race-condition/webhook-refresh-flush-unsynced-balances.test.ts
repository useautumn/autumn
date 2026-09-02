/**
 * Remy race: /track immediately after a paid attach, then invoice.created
 * webhook refresh. Without flushBalances the deduction lives only in Redis
 * and skip_cache reverts; with flush it lands in Postgres first.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion, type FullCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { Hono } from "hono";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { stripeWebhookRefreshMiddleware } from "@/external/stripe/webhookMiddlewares/stripeWebhookRefreshMiddleware.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const testCase = "webhook-refresh-flush-unsynced-balances";

const getMessagesRemaining = (customer: ApiCustomer) => {
	const balance = customer.balances[TestFeature.Messages] as {
		current_balance?: number;
		remaining?: number;
	};
	return balance.remaining ?? balance.current_balance;
};

const runInvoiceCreatedCacheRefresh = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const app = new Hono<StripeWebhookHonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			...ctx,
			fullCustomer: { id: customerId } as FullCustomer,
			stripeEvent: {
				id: "evt_remy_invoice_created",
				type: "invoice.created",
				data: {
					object: {
						customer: "cus_stripe_test",
						billing_reason: "subscription_create",
					},
				},
			} as Stripe.Event,
		} as StripeWebhookContext);
		await next();
	});
	app.use("*", stripeWebhookRefreshMiddleware);
	app.post("/", (c) => c.json({ received: true }));

	const response = await app.request("http://localhost/", { method: "POST" });
	expect(response.status).toBe(200);
};

describe(`${chalk.yellowBright("webhook-refresh-flush: invoice.created must not lose unsynced deductions")}`, () => {
	const customerId = testCase;
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_1 });

	beforeAll(async () => {
		await waitForRedisReady(ctx.redisV2, "customer-redis", 5000);

		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("invoice.created webhook refresh flushes an unsynced Redis track", async () => {
		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: "test-setup",
		});

		const messagesFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.Messages,
		)!;

		await executeRedisDeductionV2({
			ctx,
			deductions: [{ feature: messagesFeature, deduction: 5 }],
			fullSubject,
			deductionOptions: { overageBehaviour: "cap" },
		});

		const cachedBeforeRefresh =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(getMessagesRemaining(cachedBeforeRefresh)).toBe(95);

		await runInvoiceCreatedCacheRefresh({ customerId });

		const dbCustomer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(getMessagesRemaining(dbCustomer)).toBe(95);

		const rebuiltCustomer =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(getMessagesRemaining(rebuiltCustomer)).toBe(95);
	});
});
