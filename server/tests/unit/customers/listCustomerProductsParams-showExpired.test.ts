import { describe, expect, test } from "bun:test";
import { ListCustomerProductsParamsSchema } from "@autumn/shared";

const parseShowExpired = (input: unknown) =>
	ListCustomerProductsParamsSchema.parse({
		start_cursor: "",
		show_expired: input,
	}).show_expired;

describe("ListCustomerProductsParams show_expired coercion", () => {
	test('query string "false" parses to false', () => {
		expect(parseShowExpired("false")).toBe(false);
	});

	test('query string "0" parses to false', () => {
		expect(parseShowExpired("0")).toBe(false);
	});

	test('query string "true" parses to true', () => {
		expect(parseShowExpired("true")).toBe(true);
	});

	test("omitted defaults to false", () => {
		expect(
			ListCustomerProductsParamsSchema.parse({ start_cursor: "" }).show_expired,
		).toBe(false);
	});
});
