import { beforeEach, describe, expect, test } from "bun:test";
import type { Invoice } from "@autumn/shared";
import {
	buildCustomerInvoicesCacheKey,
	CUSTOMER_INVOICES_CACHE_TTL_SECONDS,
	getCachedCustomerInvoices,
	invalidateCustomerInvoicesCache,
	setCachedCustomerInvoices,
} from "../../../src/cache.js";
import { createFakeReadThroughCache } from "../utils/fakeReadThroughCache.js";

const { ctx, main, backup, reset, setStatus } = createFakeReadThroughCache();

const invoice = ({ id }: { id: string }): Invoice =>
	({
		id,
		created_at: 1_700_000_000_000,
		internal_customer_id: "cus_internal_1",
		internal_entity_id: null,
		product_ids: ["pro"],
		internal_product_ids: ["prod_internal_1"],
		stripe_id: `in_${id}`,
		processor_type: "stripe",
		status: "paid",
		hosted_invoice_url: null,
		total: 20,
		amount_paid: 20,
		refunded_amount: 0,
		currency: "usd",
		discounts: [],
		items: [],
		resolved_product_ids: ["pro"],
	}) as unknown as Invoice;

const key = buildCustomerInvoicesCacheKey({
	internalCustomerId: "cus_internal_1",
});

beforeEach(reset);

describe("customer invoices cache", () => {
	test("a miss is null; a set fills the list with the TTL", async () => {
		expect(
			await getCachedCustomerInvoices({
				ctx,
				internalCustomerId: "cus_internal_1",
			}),
		).toBeNull();

		await setCachedCustomerInvoices({
			ctx,
			internalCustomerId: "cus_internal_1",
			invoices: [invoice({ id: "inv_2" }), invoice({ id: "inv_1" })],
		});
		expect(main.calls.at(-1)).toBe(
			`set:${key}:EX:${CUSTOMER_INVOICES_CACHE_TTL_SECONDS}`,
		);

		const hit = await getCachedCustomerInvoices({
			ctx,
			internalCustomerId: "cus_internal_1",
		});
		expect(hit?.map(({ id }) => id)).toEqual(["inv_2", "inv_1"]);
	});

	test("an empty list is a hit: a customer with no invoices stays off Postgres", async () => {
		await setCachedCustomerInvoices({
			ctx,
			internalCustomerId: "cus_internal_1",
			invoices: [],
		});
		expect(
			await getCachedCustomerInvoices({
				ctx,
				internalCustomerId: "cus_internal_1",
			}),
		).toEqual([]);
	});

	test("a corrupt payload is a miss, not an error", async () => {
		main.store.set(key, "[");
		expect(
			await getCachedCustomerInvoices({
				ctx,
				internalCustomerId: "cus_internal_1",
			}),
		).toBeNull();
	});

	test("invalidate drops every customer's list on every target, once per id", async () => {
		const otherKey = buildCustomerInvoicesCacheKey({
			internalCustomerId: "cus_internal_2",
		});
		for (const redis of [main, backup]) {
			redis.store.set(key, "[]");
			redis.store.set(otherKey, "[]");
		}

		await invalidateCustomerInvoicesCache({
			ctx,
			internalCustomerIds: [
				"cus_internal_1",
				"cus_internal_1",
				"cus_internal_2",
				null,
				undefined,
			],
		});
		for (const redis of [main, backup]) {
			expect(redis.store.size).toBe(0);
			expect(redis.calls).toEqual([`del:${key}`, `del:${otherKey}`]);
		}
	});

	test("a client that is not ready fails open on every operation", async () => {
		setStatus("connecting");
		expect(
			await getCachedCustomerInvoices({
				ctx,
				internalCustomerId: "cus_internal_1",
			}),
		).toBeNull();
		await setCachedCustomerInvoices({
			ctx,
			internalCustomerId: "cus_internal_1",
			invoices: [invoice({ id: "inv_1" })],
		});
		await invalidateCustomerInvoicesCache({
			ctx,
			internalCustomerIds: ["cus_internal_1"],
		});
		expect(main.store.size).toBe(0);
	});
});
