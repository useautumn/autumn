/**
 * A memoized Stripe read is evicted only when its own deadline rejects it, so
 * it has to expire strictly inside the customer deadline. If the customer
 * attempt dies first, its retry calls back into the memo, finds the still
 * pending promise and attaches to the same stalled read — so six configured
 * attempts collapse into one real chance.
 *
 * Cutting the customer timeout without cutting this one is what breaks it.
 */

import { describe, expect, it } from "bun:test";
import { billingVerifyExportConfig } from "@/internal/customers/exports/verify/billingVerifyExportConfig.js";

describe("billing verify timeout budget", () => {
	const { customer, stripeReader, sweep } = billingVerifyExportConfig;

	it("expires a memoized read well inside the customer deadline", () => {
		expect(stripeReader.timeoutMs).toBeLessThanOrEqual(customer.timeoutMs / 2);
	});

	it("leaves room for a customer retry inside the sweep page deadline", () => {
		expect(customer.timeoutMs).toBeLessThanOrEqual(sweep.pageTimeoutMs);
	});
});
