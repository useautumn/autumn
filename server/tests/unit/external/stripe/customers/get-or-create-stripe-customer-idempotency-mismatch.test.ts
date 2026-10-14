/**
 * Concurrent get_or_create calls share a Stripe idempotency key but can differ
 * in params; pre-fix the loser surfaced Stripe's raw idempotency error.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type Customer, ErrCode } from "@autumn/shared";
import Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = { createError: new Error() };

const MOCKED_MODULE_PATHS = ["@/external/connect/createStripeCli"] as const;
const realModules = new Map<string, Record<string, unknown>>();
for (const path of MOCKED_MODULE_PATHS) {
	realModules.set(path, { ...(await import(path)) });
}

afterAll(() => {
	for (const [path, realModule] of realModules) {
		mock.module(path, () => realModule);
	}
});

mock.module("@/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		customers: {
			create: async () => {
				throw mockState.createError;
			},
		},
	}),
}));

const { getOrCreateStripeCustomer } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/external/stripe/customers/operations/getOrCreateStripeCustomer.ts?idempotencyMismatch"
);

const ctx = {
	org: { id: "org_123", config: {} },
	env: AppEnv.Live,
	logger: { info: () => {}, warn: () => {}, error: () => {} },
} as unknown as AutumnContext;

const customer = {
	id: "customer_123",
	internal_id: "cus_internal_123",
	email: "customer@example.com",
	metadata: {},
	processor: null,
} as unknown as Customer;

describe("getOrCreateStripeCustomer idempotency mismatch", () => {
	beforeEach(() => {
		mockState.createError = new Stripe.errors.StripeIdempotencyError({
			type: "idempotency_error",
			message:
				"Keys for idempotent requests can only be used with the same parameters they were first used with.",
		});
	});

	test("answers 409 so the caller retries through the existing-customer path", async () => {
		await expect(
			getOrCreateStripeCustomer({ ctx, customer }),
		).rejects.toMatchObject({
			statusCode: 409,
			code: ErrCode.StripeCreateCustomerFailed,
		});
	});

	test("rethrows other Stripe errors", async () => {
		const invalidRequestError = new Stripe.errors.StripeInvalidRequestError({
			type: "invalid_request_error",
			message: "Invalid email",
		});
		mockState.createError = invalidRequestError;

		await expect(getOrCreateStripeCustomer({ ctx, customer })).rejects.toBe(
			invalidRequestError,
		);
	});
});
