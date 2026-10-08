import { describe, expect, test } from "bun:test";
import { CreateInvoiceParamsSchema } from "./createInvoiceParams.js";

const accepts = (params: Record<string, unknown>) =>
	CreateInvoiceParamsSchema.safeParse({ customer_id: "cus", ...params })
		.success;

describe("CreateInvoiceParams entity ids", () => {
	test("rejects an empty entity_id at either level, so scope is never dropped silently", () => {
		expect(accepts({ entity_id: "", plans: [{ plan_id: "pro" }] })).toBe(false);
		expect(
			accepts({
				entity_id: "workspace-a",
				plans: [{ plan_id: "pro", entity_id: "" }],
			}),
		).toBe(false);
	});

	test("accepts an entity id, null for customer-level, or omission", () => {
		expect(
			accepts({
				entity_id: "workspace-a",
				plans: [
					{ plan_id: "pro" },
					{ plan_id: "pro", entity_id: null },
					{ plan_id: "pro", entity_id: "workspace-b" },
				],
			}),
		).toBe(true);
	});
});
