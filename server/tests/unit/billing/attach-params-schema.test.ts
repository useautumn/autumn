import { describe, expect, test } from "bun:test";
import { AttachParamsV0Schema } from "@api/billing/attachV2/attachParamsV0";
import { AttachParamsV1Schema } from "@api/billing/attachV2/attachParamsV1";

const schemas = [
	["V0", AttachParamsV0Schema, { customer_id: "cus", product_id: "pro" }],
	["V1", AttachParamsV1Schema, { customer_id: "cus", plan_id: "pro" }],
] as const;

describe("attach params starts_at", () => {
	test.each(schemas)("%s accepts Unix-ms integers", (_, schema, params) => {
		expect(
			schema.safeParse({
				...params,
				starts_at: 1_775_123_200_000,
			}).success,
		).toBe(true);
	});

	test.each(schemas)(
		"%s rejects malformed numeric timestamps",
		(_, schema, params) => {
			for (const starts_at of [
				1_775_123_200_000.5,
				Number.NaN,
				Infinity,
				-1,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				expect(
					schema.safeParse({
						...params,
						starts_at,
					}).success,
				).toBe(false);
			}
		},
	);
});
