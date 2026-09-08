import { describe, expect, test } from "bun:test";
import { resolveThresholdBilling } from "@/internal/balances/thresholdBilling/resolve/resolveThresholdBilling";

describe("resolveThresholdBilling", () => {
	test("has no scope when the customer has no threshold price", () => {
		const fullCustomer = { customer_products: [] } as never;
		const feature = { id: "messages" } as never;
		expect(resolveThresholdBilling({ fullCustomer, feature })).toBeNull();
	});
});
