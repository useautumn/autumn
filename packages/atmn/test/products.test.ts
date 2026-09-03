import { describe, expect, test } from "bun:test";
import { formatPrice } from "../src/commands/products/headless";

describe("formatPrice", () => {
	test("formats dollar amounts with interval correctly without dividing by 100", () => {
		expect(formatPrice(3000, "month")).toBe("$3,000/month");
		expect(formatPrice(100, "month")).toBe("$100/month");
		expect(formatPrice(20, "month")).toBe("$20/month");
		expect(formatPrice(30, "year")).toBe("$30/year");
	});

	test("formats dollar amounts without interval", () => {
		expect(formatPrice(3000)).toBe("$3,000");
		expect(formatPrice(100)).toBe("$100");
		expect(formatPrice(0)).toBe("$0");
	});

	test("formats decimal amounts correctly", () => {
		expect(formatPrice(0.05, "month")).toBe("$0.05/month");
		expect(formatPrice(19.99, "month")).toBe("$19.99/month");
	});

	test("formats with custom currency", () => {
		expect(formatPrice(50, "month", "EUR")).toMatch(/50.*\/month/);
	});
});
