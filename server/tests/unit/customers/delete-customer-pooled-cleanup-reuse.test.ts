/**
 * The customer endpoint delegates deletion to the pooled-aware service boundary.
 */

import { expect, mock, test } from "bun:test";
import { AppEnv, type DbCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const customer = {
	id: "customer_a",
	internal_id: "internal_customer_a",
	processor: null,
} as DbCustomer;
const deleteByInternalId = mock(async () => [customer]);

mock.module("@/internal/customers/CusService", () => ({
	CusService: {
		get: mock(async () => customer),
		deleteByInternalId,
	},
}));
mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer",
	() => ({ deleteCachedFullCustomer: mock(async () => {}) }),
);
mock.module("@/external/stripe/stripeCusUtils", () => ({
	deleteStripeCustomer: mock(async () => {}),
}));

const { deleteCustomer } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/actions/deleteCustomer.js?pooledCleanupReuse"
);

test("deleteCustomer reuses CusService.deleteByInternalId", async () => {
	const db = { marker: "database" };
	const ctx = {
		db,
		org: { id: "org_a" },
		env: AppEnv.Sandbox,
		logger: { error: mock(() => {}) },
	} as unknown as AutumnContext;

	await deleteCustomer({
		ctx,
		params: {
			customer_id: customer.id!,
			delete_in_stripe: false,
		},
	});

	expect(deleteByInternalId).toHaveBeenCalledWith({
		db,
		internalId: customer.internal_id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
});
