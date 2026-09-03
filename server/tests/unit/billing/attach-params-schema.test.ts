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

describe("attach params currency", () => {
	test.each(schemas)("%s preserves currency", (_, schema, params) => {
		const result = schema.safeParse({
			...params,
			currency: "eur",
		});
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({ currency: "eur" });
	});
});

describe("attach params refund_last_payment", () => {
	test.each(schemas)("%s accepts an immediate refund", (_, schema, params) => {
		expect(
			schema.safeParse({
				...params,
				plan_schedule: "immediate",
				refund_last_payment: "prorated",
			}).success,
		).toBe(true);
	});

	// The outgoing plan stays active until the cycle ends, so its payment
	// cannot be handed back yet.
	test.each(schemas)(
		"%s rejects a refund on an end-of-cycle switch",
		(_, schema, params) => {
			expect(
				schema.safeParse({
					...params,
					plan_schedule: "end_of_cycle",
					refund_last_payment: "full",
				}).success,
			).toBe(false);
		},
	);

	test("V0 rejects a refund alongside billing_behavior", () => {
		expect(
			AttachParamsV0Schema.safeParse({
				customer_id: "cus",
				product_id: "pro",
				refund_last_payment: "prorated",
				billing_behavior: "prorate_immediately",
			}).success,
		).toBe(false);
	});

	test("V1 rejects a refund alongside proration_behavior", () => {
		expect(
			AttachParamsV1Schema.safeParse({
				customer_id: "cus",
				plan_id: "pro",
				refund_last_payment: "prorated",
				proration_behavior: "prorate_immediately",
			}).success,
		).toBe(false);
	});

	test.each(schemas)(
		"%s still accepts an attach with no refund",
		(_, schema, params) => {
			expect(schema.safeParse(params).success).toBe(true);
		},
	);
});
