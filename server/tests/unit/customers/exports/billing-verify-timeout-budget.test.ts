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
