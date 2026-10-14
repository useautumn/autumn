/**
 * Concurrent get_or_create calls share a Stripe idempotency key but can differ
 * in params; pre-fix the loser threw Stripe's idempotency error.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type Customer, ProcessorType } from "@autumn/shared";
import Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const idempotencyMismatch = new Stripe.errors.StripeIdempotencyError({
	type: "idempotency_error",
	message:
		"Keys for idempotent requests can only be used with the same parameters they were first used with.",
});

const mockState = {
	createError: idempotencyMismatch as Error,
	linkAfterLookups: 0,
	staleProcessorId: null as string | null,
	lookups: 0,
	creates: 0,
	emailUpdates: [] as { id: string; email: string }[],
};

const MOCKED_MODULE_PATHS = [
	"@/external/connect/createStripeCli",
	"@/internal/customers/CusService",
] as const;
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
				mockState.creates++;
				throw mockState.createError;
			},
			retrieve: async (id: string) =>
				id === mockState.staleProcessorId
					? { id, object: "customer", deleted: true }
					: { id, object: "customer", email: null },
			update: async (id: string, { email }: { email: string }) => {
				mockState.emailUpdates.push({ id, email });
				return { id, email };
			},
		},
	}),
}));

mock.module("@/internal/customers/CusService", () => ({
	CusService: {
		get: async () => {
			mockState.lookups++;
			const linkedId =
				mockState.lookups > mockState.linkAfterLookups
					? "cus_stripe_linked"
					: mockState.staleProcessorId;
			return {
				email: "customer@example.com",
				processor: linkedId
					? { id: linkedId, type: ProcessorType.Stripe }
					: null,
			};
		},
	},
}));

const { getOrCreateStripeCustomer } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/external/stripe/customers/operations/getOrCreateStripeCustomer.ts?idempotencyMismatch"
);

const ctx = {
	org: { id: "org_123", config: {} },
	env: AppEnv.Live,
	db: {},
	logger: { info: () => {}, warn: () => {}, error: () => {} },
} as unknown as AutumnContext;

const buildCustomer = () =>
	({
		id: "customer_123",
		internal_id: "cus_internal_123",
		email: "customer@example.com",
		name: null,
		metadata: {},
		processor: null,
	}) as unknown as Customer;

describe("getOrCreateStripeCustomer idempotency mismatch", () => {
	beforeEach(() => {
		mockState.createError = idempotencyMismatch;
		mockState.linkAfterLookups = 1;
		mockState.staleProcessorId = null;
		mockState.lookups = 0;
		mockState.creates = 0;
		mockState.emailUpdates = [];
	});

	test("resolves to the concurrently linked Stripe customer with the saved email", async () => {
		const stripeCustomer = await getOrCreateStripeCustomer({
			ctx,
			customer: buildCustomer(),
		});

		expect(stripeCustomer.id).toBe("cus_stripe_linked");
		expect(mockState.emailUpdates).toEqual([
			{ id: "cus_stripe_linked", email: "customer@example.com" },
		]);
	});

	test("waits past a stale link to a deleted Stripe customer without creating again", async () => {
		mockState.staleProcessorId = "cus_stripe_deleted";
		mockState.linkAfterLookups = 2;

		const stripeCustomer = await getOrCreateStripeCustomer({
			ctx,
			customer: buildCustomer(),
		});

		expect(stripeCustomer.id).toBe("cus_stripe_linked");
		expect(mockState.creates).toBe(1);
	});

	test("rethrows the idempotency error when no Stripe customer gets linked", async () => {
		mockState.linkAfterLookups = Number.POSITIVE_INFINITY;

		await expect(
			getOrCreateStripeCustomer({ ctx, customer: buildCustomer() }),
		).rejects.toBe(idempotencyMismatch);
	});

	test("rethrows other Stripe errors", async () => {
		const invalidRequestError = new Stripe.errors.StripeInvalidRequestError({
			type: "invalid_request_error",
			message: "Invalid email",
		});
		mockState.createError = invalidRequestError;

		await expect(
			getOrCreateStripeCustomer({ ctx, customer: buildCustomer() }),
		).rejects.toBe(invalidRequestError);
		expect(mockState.lookups).toBe(0);
	});
});
