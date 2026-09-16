import { describe, expect, test } from "bun:test";
import { resolveSkipReason } from "@/internal/migrations/v2/run/migrateCustomer/resolveSkipReason.js";

describe("resolveSkipReason", () => {
	test("matched products that needed nothing → no_updates_needed", () => {
		expect(
			resolveSkipReason({
				matchedCustomerProducts: 0,
				unchangedCustomerProducts: 1,
			}),
		).toBe("no_updates_needed");
	});

	test("nothing matched the operation at all → ineligible", () => {
		expect(
			resolveSkipReason({
				matchedCustomerProducts: 0,
				unchangedCustomerProducts: 0,
			}),
		).toBe("ineligible");
	});

	test("a customer with changes is not skipped", () => {
		expect(
			resolveSkipReason({
				matchedCustomerProducts: 1,
				unchangedCustomerProducts: 1,
			}),
		).toBeNull();
	});
});
