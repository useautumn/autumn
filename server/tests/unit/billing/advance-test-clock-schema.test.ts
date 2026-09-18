import { describe, expect, test } from "bun:test";
import {
	AdvanceTestClockParamsSchema,
	AdvanceTestClockResponseSchema,
} from "@autumn/shared";

describe("advance test clock schema", () => {
	test("accepts epoch milliseconds", () => {
		expect(
			AdvanceTestClockParamsSchema.parse({
				customer_id: "customer_123",
				frozen_time: 1800000000123,
			}),
		).toEqual({ customer_id: "customer_123", frozen_time: 1800000000123 });
	});
	test.each([undefined, "1800000000000", -1, 1.5, Infinity, NaN])(
		"rejects invalid frozen_time %s",
		(frozen_time) => {
			expect(
				AdvanceTestClockParamsSchema.safeParse({
					customer_id: "customer_123",
					frozen_time,
				}).success,
			).toBe(false);
		},
	);
	test("requires a customer and validates response statuses", () => {
		expect(
			AdvanceTestClockParamsSchema.safeParse({
				customer_id: "",
				frozen_time: 1800000000000,
			}).success,
		).toBe(false);
		expect(
			AdvanceTestClockResponseSchema.safeParse({
				customer_id: "customer_123",
				frozen_time: 1800000000000,
				status: "advancing",
			}).success,
		).toBe(true);
	});
});
