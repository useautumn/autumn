/**
 * The addLines request key is derived from the invoice state that was
 * observed (line ids already present), not from the lines about to be
 * written. Two overlapping deliveries that read the same state therefore
 * share a key even when they computed different pending sets, so Stripe
 * replays or rejects the second instead of writing the shared lines twice.
 * A replayed cached failure is salted with Stripe's original request id,
 * which every observer of that failure derives identically.
 */

import { describe, expect, test } from "bun:test";
import {
	buildInvoiceAddLinesIdempotencyKey,
	getReplayedStripeRequestId,
} from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/buildInvoiceAddLinesIdempotencyKey";

describe("buildInvoiceAddLinesIdempotencyKey", () => {
	test("is stable for the same observed state regardless of id order", () => {
		const first = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: ["li_a", "li_b"],
		});
		const second = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: new Set(["li_b", "li_a"]),
		});

		expect(first).toBe(second);
		expect(first.startsWith("autumn:invoice.addLines:in_1:")).toBe(true);
		expect(first.length).toBeLessThanOrEqual(255);
	});

	test("changes once the observed state changes", () => {
		const empty = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
		});
		const afterWrite = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: ["li_a"],
		});

		expect(empty).not.toBe(afterWrite);
	});

	test("changes across invoices", () => {
		const first = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
		});
		const otherInvoice = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_2",
			existingLineItemIds: [],
		});

		expect(first).not.toBe(otherInvoice);
	});

	test("a salt derives a different but still deterministic key", () => {
		const base = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
		});
		const salted = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
			salt: "req_orig",
		});
		const saltedAgain = buildInvoiceAddLinesIdempotencyKey({
			invoiceId: "in_1",
			existingLineItemIds: [],
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
