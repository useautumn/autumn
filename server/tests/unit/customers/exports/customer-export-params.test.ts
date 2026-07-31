import { describe, expect, it } from "bun:test";
import {
	CreateCustomerExportParamsSchema,
	CustomerExportField,
} from "@autumn/shared";

describe("CreateCustomerExportParamsSchema", () => {
	it("rejects duplicate export fields", () => {
		const result = CreateCustomerExportParamsSchema.safeParse({
			fields: [CustomerExportField.Name, CustomerExportField.Name],
		});

		expect(result.success).toBe(false);
	});
});
