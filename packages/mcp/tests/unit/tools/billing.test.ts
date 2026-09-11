import { describe, expect, test } from "bun:test";
import { z } from "zod/v4";
import { billing } from "../../../src/tools/billing.js";

const attachRequest = {
	customer_id: "cus_123",
	plan_id: "pro",
};

describe("attach schemas", () => {
	test("default top-level enable_plan_immediately to true under invoice mode", () => {
		for (const schema of [
			billing.schemas.attach,
			billing.schemas.previewAttach,
		]) {
			const parsed = schema.parse({
				...attachRequest,
				invoice_mode: { enabled: true, finalize: false },
			});
			expect(parsed.enable_plan_immediately).toBe(true);
		}
	});

	test("keep an explicit enable_plan_immediately under invoice mode", () => {
		const parsed = billing.schemas.attach.parse({
			...attachRequest,
			enable_plan_immediately: false,
			invoice_mode: { enabled: true, finalize: false },
		});
		expect(parsed.enable_plan_immediately).toBe(false);
	});

	test("leave enable_plan_immediately unset without invoice mode", () => {
		expect(
			billing.schemas.attach.parse(attachRequest).enable_plan_immediately,
		).toBeUndefined();
		expect(
			billing.schemas.attach.parse({
				...attachRequest,
				invoice_mode: { enabled: false },
			}).enable_plan_immediately,
		).toBeUndefined();
	});

	test("still convert to JSON schema for tool discovery", () => {
		const jsonSchema = z.toJSONSchema(billing.schemas.attach, { io: "input" });
		expect(jsonSchema).toMatchObject({ type: "object" });
	});
});
