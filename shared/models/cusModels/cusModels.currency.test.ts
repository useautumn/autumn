import { describe, expect, test } from "bun:test";
import { AppEnv } from "../genModels/genEnums.js";
import { CustomerSchema } from "./cusModels.js";

const baseCustomer = {
	internal_id: "cus_internal_1",
	org_id: "org_1",
	created_at: 0,
	env: AppEnv.Sandbox,
};

describe("Customer currency", () => {
	test("preserves an explicit currency", () => {
		const parsed = CustomerSchema.parse({ ...baseCustomer, currency: "eur" });
		expect(parsed.currency).toBe("eur");
	});

	test("currency is optional (null = use org default)", () => {
		const parsed = CustomerSchema.parse(baseCustomer);
		expect(parsed.currency).toBeUndefined();
	});

	test("accepts an explicit null currency", () => {
		const parsed = CustomerSchema.parse({ ...baseCustomer, currency: null });
		expect(parsed.currency).toBeNull();
	});
});
