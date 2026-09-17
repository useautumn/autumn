/**
 * The addLines request key is derived from the invoice state that was
 * observed (line ids already present) and the exact request params. The
 * same write from two deliveries shares a key, so Stripe dedupes it, while
 * any change in what is on the invoice or in the line amounts gets a fresh
 * key instead of a permanent params-mismatch against a cached failure.
 * A replayed cached failure is salted with Stripe's original request id,
 * which every observer of that failure derives identically.
 */

import { describe, expect, test } from "bun:test";
import {
	buildInvoiceAddLinesIdempotencyKey,
	getReplayedStripeRequestId,
} from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/buildInvoiceAddLinesIdempotencyKey";

const lines = [{ amount: 100, metadata: { autumn_line_item_id: "li_a" } }];

describe("buildInvoiceAddLinesIdempotencyKey", () => {
	test("is stable for the same observed state and params regardless of ordering", () => {
		const first = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: ["li_x", "li_y"],
			requestParams: [{ amount: 100, metadata: { b: "2", a: "1" } }],
		});
		const second = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: new Set(["li_y", "li_x"]),
			requestParams: [{ metadata: { a: "1", b: "2" }, amount: 100 }],
		});

		expect(first).toBe(second);
		expect(first.startsWith("autumn:invoice.addLines:in_1:")).toBe(true);
		expect(first.length).toBeLessThanOrEqual(255);
	});

	test("ignores undefined params so optional fields do not change the key", () => {
		const withUndefined = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: [{ amount: 100, price_data: undefined }],
		});
		const without = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: [{ amount: 100 }],
		});

		expect(withUndefined).toBe(without);
	});

	test("changes once the observed state changes", () => {
		const empty = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: lines,
		});
		const afterWrite = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: ["li_a"],
			requestParams: lines,
		});

		expect(empty).not.toBe(afterWrite);
	});

	test("changes when the request params change", () => {
		const first = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: lines,
		});
		const moreUsage = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: [{ ...lines[0], amount: 150 }],
		});

		expect(first).not.toBe(moreUsage);
	});

	test("changes across invoices", () => {
		const first = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: lines,
		});
		const otherInvoice = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_2",
			existingLineItemIds: [],
			requestParams: lines,
		});

		expect(first).not.toBe(otherInvoice);
	});

	test("a salt derives a different but still deterministic key", () => {
		const base = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: lines,
		});
		const salted = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: lines,
			salt: "req_orig",
		});
		const saltedAgain = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			requestParams: lines,
			salt: "req_orig",
		});

		expect(salted).not.toBe(base);
		expect(salted).toBe(saltedAgain);
		expect(salted.length).toBeLessThanOrEqual(255);
	});
});

describe("getReplayedStripeRequestId", () => {
	test("returns the original request id when Stripe replayed a cached response", () => {
		expect(
			getReplayedStripeRequestId({
				headers: {
					"idempotent-replayed": "true",
					"original-request": "req_orig",
					"request-id": "req_replay",
				},
			}),
		).toBe("req_orig");
	});

	test("returns nothing when the replay carries no original request id", () => {
		expect(
			getReplayedStripeRequestId({
				headers: { "idempotent-replayed": "true", "request-id": "req_replay" },
			}),
		).toBeUndefined();
	});

	test("never treats a params-mismatch idempotency error as a replay", () => {
		const headers = {
			"idempotent-replayed": "true",
			"original-request": "req_orig",
		};
		expect(
			getReplayedStripeRequestId({ type: "StripeIdempotencyError", headers }),
		).toBeUndefined();
		expect(
			getReplayedStripeRequestId({ rawType: "idempotency_error", headers }),
		).toBeUndefined();
	});

	test("returns nothing for a fresh error", () => {
		expect(
			getReplayedStripeRequestId({ headers: { "request-id": "req_fresh" } }),
		).toBeUndefined();
		expect(getReplayedStripeRequestId(new Error("boom"))).toBeUndefined();
		expect(getReplayedStripeRequestId(undefined)).toBeUndefined();
	});
});
