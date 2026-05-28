import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const state = {
	customerFetchArgs: [] as unknown[],
};

mock.module(
	"@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling.js",
	() => ({
		fetchStripeCustomerForBilling: async (args: unknown) => {
			state.customerFetchArgs.push(args);
			return {
				stripeCus: undefined,
				paymentMethod: undefined,
				testClockFrozenTime: undefined,
			};
		},
	}),
);

import { createMigrationStripeCache } from "@/internal/migrations/v2/stripeCache/createMigrationStripeCache";

const ctx = {} as AutumnContext;
const fullCustomer = {
	id: "cus_1",
	internal_id: "cus_internal",
} as FullCustomer;

describe("createMigrationStripeCache", () => {
	beforeEach(() => {
		state.customerFetchArgs = [];
	});

	test("passes read-only customer fetch mode when Stripe customer creation is disabled", async () => {
		const cache = createMigrationStripeCache({
			ctx,
			fullCustomer,
			allowStripeCustomerCreation: false,
		});

		await cache.getStripeCustomer();

		expect(state.customerFetchArgs).toHaveLength(1);
		expect(state.customerFetchArgs[0]).toMatchObject({
			ctx,
			fullCus: fullCustomer,
			createIfMissing: false,
		});
	});

	test("allows Stripe customer creation by default", async () => {
		const cache = createMigrationStripeCache({
			ctx,
			fullCustomer,
		});

		await cache.getStripeCustomer();

		expect(state.customerFetchArgs).toHaveLength(1);
		expect(state.customerFetchArgs[0]).toMatchObject({
			createIfMissing: true,
		});
	});
});

afterAll(() => {
	mock.restore();
});
