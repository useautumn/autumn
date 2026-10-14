/**
 * Concurrent creates for one customer share a Stripe idempotency key but can
 * differ in params; pre-fix the loser threw Stripe's idempotency error.
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
	linkedProcessorId: null as string | null,
	linkAfterLookups: 0,
	lookups: 0,
	savedEmail: null as string | null,
	emailUpdates: [] as { id: string; email: string }[],
	searchResults: [] as { id: string }[],
	retrievedIds: [] as string[],
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
				throw mockState.createError;
			},
			search: async () => ({ data: mockState.searchResults }),
			retrieve: async (id: string) => {
				mockState.retrievedIds.push(id);
				return { id, object: "customer", email: null };
			},
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
			const linked =
				mockState.linkedProcessorId &&
				mockState.lookups > mockState.linkAfterLookups;
			return {
				email: mockState.savedEmail,
				processor: linked
					? { id: mockState.linkedProcessorId, type: ProcessorType.Stripe }
					: null,
			};
		},
	},
}));

const { createStripeCustomer } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/external/stripe/customers/operations/createStripeCustomer.ts?idempotencyMismatch"
);

const ctx = {
	org: { id: "org_123", config: {} },
	env: AppEnv.Live,
	db: {},
	logger: { info: () => {}, warn: () => {}, error: () => {} },
} as unknown as AutumnContext;

const customer = {
	id: "customer_123",
	internal_id: "cus_internal_123",
	email: "customer@example.com",
	name: null,
	metadata: {},
} as unknown as Customer;

describe("createStripeCustomer idempotency mismatch", () => {
	beforeEach(() => {
		mockState.createError = idempotencyMismatch;
		mockState.linkedProcessorId = null;
		mockState.linkAfterLookups = 0;
		mockState.lookups = 0;
		mockState.savedEmail = null;
		mockState.emailUpdates = [];
		mockState.searchResults = [];
		mockState.retrievedIds = [];
	});

	test("resolves to the Stripe customer the concurrent create linked", async () => {
		mockState.linkedProcessorId = "cus_stripe_linked";

		const stripeCustomer = await createStripeCustomer({ ctx, customer });

		expect(stripeCustomer.id).toBe("cus_stripe_linked");
	});

	test("resolves to the Stripe customer tagged with the autumn internal id", async () => {
		mockState.searchResults = [{ id: "cus_stripe_tagged" }];

		const stripeCustomer = await createStripeCustomer({ ctx, customer });

		expect(stripeCustomer.id).toBe("cus_stripe_tagged");
	});

	test("waits for the concurrent create to link its Stripe customer", async () => {
		mockState.linkedProcessorId = "cus_stripe_linked";
		mockState.linkAfterLookups = 2;

		const stripeCustomer = await createStripeCustomer({ ctx, customer });

		expect(stripeCustomer.id).toBe("cus_stripe_linked");
	});

	test("rethrows the idempotency error when no Stripe customer turns up", async () => {
		await expect(createStripeCustomer({ ctx, customer })).rejects.toBe(
			idempotencyMismatch,
		);
	});

	test("applies the saved email to the recovered Stripe customer", async () => {
		mockState.linkedProcessorId = "cus_stripe_linked";
		mockState.savedEmail = "customer@example.com";

		const stripeCustomer = await createStripeCustomer({ ctx, customer });

		expect(stripeCustomer.email).toBe("customer@example.com");
		expect(mockState.emailUpdates).toEqual([
			{ id: "cus_stripe_linked", email: "customer@example.com" },
		]);
	});

	test("rethrows other Stripe errors", async () => {
		const invalidRequestError = new Stripe.errors.StripeInvalidRequestError({
			type: "invalid_request_error",
			message: "Invalid email",
		});
		mockState.createError = invalidRequestError;
		mockState.linkedProcessorId = "cus_stripe_linked";

		await expect(createStripeCustomer({ ctx, customer })).rejects.toBe(
			invalidRequestError,
		);
		expect(mockState.retrievedIds).toHaveLength(0);
	});
});
