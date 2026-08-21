import { describe, expect, test } from "bun:test";
import { ListCustomerProductsParamsSchema } from "@autumn/shared";

const parseStatus = (input: unknown) =>
	ListCustomerProductsParamsSchema.parse({
		start_cursor: "",
		status: input,
	}).status;

describe("ListCustomerProductsParams status filter", () => {
	test('"active" parses', () => {
		expect(parseStatus("active")).toBe("active");
	});

	test('"expired" parses', () => {
		expect(parseStatus("expired")).toBe("expired");
	});

	test('"all" parses', () => {
		expect(parseStatus("all")).toBe("all");
	});

	test('omitted defaults to "active"', () => {
		expect(
			ListCustomerProductsParamsSchema.parse({ start_cursor: "" }).status,
		).toBe("active");
	});

	test("unknown value rejects", () => {
		expect(() => parseStatus("bogus")).toThrow();
	});
});
