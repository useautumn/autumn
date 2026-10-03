import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { Writable } from "node:stream";
import { createErrorLogHook } from "@autumn/errors";
import {
	AppEnv,
	BillWhen,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { Hono } from "hono";
import pino from "pino";
import Stripe from "stripe";
import { errorMiddleware } from "@/honoMiddlewares/errorMiddleware/errorMiddleware.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const originalError = new Stripe.errors.StripeInvalidRequestError({
	type: "invalid_request_error",
	message: "No such subscription: 'sub_123'",
	code: "resource_missing",
});
const rollbackError = new Error("Entitlement restoration failed");
const cleanupError = new Error("Cache invalidation failed");
const transientError = Object.assign(new Error("Billing persistence failed"), {
	code: "ECONNRESET",
});
const captures: unknown[] = [];
const order: string[] = [];
const lines: { level: number; msg: string }[] = [];
let failRollback = false;
let failCleanup = false;
let invoiceError: Error = originalError;

const customerEntitlement = {
	id: "ce_123",
	customer_product_id: "cp_123",
	balance: 10,
	additional_balance: 0,
	adjustment: 0,
	entities: {},
	entitlement: {
		id: "ent_123",
		feature: {
			id: "seats",
			internal_id: "feature_123",
			config: { usage_type: FeatureUsageType.Continuous },
		},
	},
	customer_product: {
		id: "cp_123",
		status: "active",
		customer_prices: [
			{
				customer_product_id: "cp_123",
				price: {
					entitlement_id: "ent_123",
					config: { bill_when: BillWhen.EndOfPeriod, should_prorate: true },
				},
			},
		],
	},
} as FullCusEntWithFullCusProduct;

const subject = {
	subjectType: "customer",
	internalCustomerId: "internal_customer_123",
	invoices: [],
	customerId: "customer_123",
	customer: { id: "customer_123" } as FullSubject["customer"],
	customer_products: [
		{
			...customerEntitlement.customer_product,
			customer_entitlements: [customerEntitlement],
		},
	],
	extra_customer_entitlements: [],
	pooled_customer_entitlements: [],
} as FullSubject;

await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/prepareDeductionOptionsV2.js",
	() => ({ prepareDeductionOptionsV2: () => ({ paidAllocatedV1: false }) }),
);
await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/prepareFeatureDeductionV2.js",
	() => ({
		prepareFeatureDeductionV2: () => ({
			customerEntitlements: [customerEntitlement],
			customerEntitlementDeductions: [],
			rollovers: [],
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js",
	() => ({ isBalanceWorkerRolloutEnabled: () => false }),
);
await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/syncDeductionBalancesToFullSubjectCache.js",
	() => ({ syncDeductionBalancesToFullSubjectCache: async () => {} }),
);
await mockModuleWithRestore(
	"@/internal/balances/utils/allocatedInvoice/createAllocatedInvoice.js",
	() => ({
		createAllocatedInvoice: async () => {
			order.push("invoice");
			throw invoiceError;
		},
	}),
);
await mockModuleWithRestore(
	"@/external/redis/availabilityMonitor/redisV2Availability.js",
	() => ({ shouldUseRedisV2: () => true }),
);

const { withRedisFailOpen } = await import(
	"@/external/redis/utils/withRedisFailOpen.js"
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js",
	() => ({
		invalidateCachedFullSubject: async () => {
			order.push("invalidate");
			if (failCleanup) throw cleanupError;
		},
	}),
);

const { runPostgresTrackV3 } = await import(
	"@/internal/balances/track/v3/runPostgresTrackV3.js"
);

const pinoLogger = pino(
	{
		hooks: {
			logMethod: createErrorLogHook({
				service: "server",
				captureToSentry: true,
			}),
		},
	},
	new Writable({
		write(chunk, _encoding, callback) {
			lines.push(JSON.parse(chunk.toString()));
			callback();
		},
	}),
);

const runFailedTrack = async () => {
	const ctx = {
		org: { id: "org_123", config: {} },
		env: AppEnv.Sandbox,
		logger: {
			debug: (message: string, fields = {}) =>
				pinoLogger.debug(fields, message),
			info: (message: string, fields = {}) => pinoLogger.info(fields, message),
			warn: (message: string, fields = {}) => pinoLogger.warn(fields, message),
			error: (message: string, fields = {}) =>
				pinoLogger.error(fields, message),
		},
		db: {
			execute: (async () => [
				{
					deduct_from_cus_ents: {
						updates: { ce_123: { balance: 9, deducted: 1 } },
						rollover_updates: [],
						mutation_logs: [],
					},
				},
			]) as AutumnContext["db"]["execute"],
		} as AutumnContext["db"],
	} as AutumnContext;
	const app = new Hono<HonoEnv>();
	app.onError((error, c) => {
		order.push("boundary");
		return errorMiddleware(error, c);
	});
	app.post("/v1/track", async (c) => {
		c.set("ctx", ctx);
		const run = () =>
			runPostgresTrackV3({
				ctx,
				fullSubject: structuredClone(subject),
				body: { customer_id: "customer_123", feature_id: "seats", value: 1 },
				featureDeductions: [
					{ feature: customerEntitlement.entitlement.feature, deduction: 1 },
				],
			});
		return withRedisFailOpen<Response>({
			source: "runTrackWithRollout",
			run: async () => {
				await run();
				return c.json({ success: true });
			},
			fallback: async () => {
				order.push("queue");
				return c.json({ queued: true }, 202);
			},
		});
	});
	return app.request("/v1/track", { method: "POST" });
};

beforeEach(() => {
	captures.length = 0;
	order.length = 0;
	lines.length = 0;
	failRollback = false;
	failCleanup = false;
	invoiceError = originalError;
	spyOn(Sentry, "captureException").mockImplementation((error) => {
		captures.push(error);
		return "event_123";
	});
	spyOn(Sentry, "captureEvent").mockImplementation((event) => {
		captures.push(event.message);
		return "event_123";
	});
	spyOn(Sentry, "getClient").mockReturnValue(
		new Sentry.BunClient({
			integrations: [],
			transport: Sentry.makeFetchTransport,
			stackParser: () => [],
		}),
	);
	spyOn(CusEntService, "update").mockImplementation(async () => {
		order.push("rollback");
		if (failRollback) throw rollbackError;
		return [];
	});
});

afterAll(() => mock.restore());

test("captures the original failure once after successful rollback", async () => {
	const response = await runFailedTrack();
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ code: "stripe_error" });
	expect(order).toEqual(["invoice", "rollback", "invalidate", "boundary"]);
	expect(captures).toEqual([originalError]);
	expect(lines).toContainEqual(
		expect.objectContaining({
			level: 40,
			msg: expect.stringContaining("Attempting rollback"),
		}),
	);
});

test("retains separate rollback failure visibility and the original boundary capture", async () => {
	failRollback = true;
	const response = await runFailedTrack();
	expect(response.status).toBe(400);
	expect(order).toEqual(["invoice", "rollback", "invalidate", "boundary"]);
	expect(captures).toEqual([
		expect.stringContaining("Failed to rollback cusEnt ce_123"),
		originalError,
	]);
});

test("retains the original failure when cleanup replaces the boundary exception", async () => {
	failCleanup = true;
	const response = await runFailedTrack();
	expect(response.status).toBe(500);
	expect(await response.json()).toMatchObject({
		message: cleanupError.message,
	});
	expect(order).toEqual(["invoice", "rollback", "invalidate", "boundary"]);
	expect(captures).toEqual([originalError, cleanupError]);
});

test("retains billing failure capture when fail-open queues replay without a boundary error", async () => {
	invoiceError = transientError;
	const response = await runFailedTrack();
	expect(response.status).toBe(202);
	expect(order).toEqual(["invoice", "rollback", "invalidate", "queue"]);
	expect(captures).toEqual([
		expect.stringContaining("Billing persistence failed"),
	]);
});
