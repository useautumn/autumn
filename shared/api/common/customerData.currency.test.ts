import { describe, expect, test } from "bun:test";
import { CustomerDataSchema } from "./customerData.js";

describe("CustomerData currency", () => {
	test("preserves the currency as given (normalization happens at storage)", () => {
		const parsed = CustomerDataSchema.parse({ currency: "EUR" });
		expect(parsed.currency).toBe("EUR");
	});

	test("currency is optional", () => {
		const parsed = CustomerDataSchema.parse({});
		expect(parsed.currency).toBeUndefined();
	});
});
