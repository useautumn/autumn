import { describe, expect, test } from "bun:test";
import { computeCustomerProductTransition } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeCustomerProductTransition";

describe("computeCustomerProductTransition", () => {
	test("returns no transition when the seat product is unchanged", () => {
		expect(
			computeCustomerProductTransition({
				fromInternalProductId: "seat_internal",
				toInternalProductId: "seat_internal",
			}),
		).toBeUndefined();
	});

	test("returns a transition when the seat product changes", () => {
		expect(
			computeCustomerProductTransition({
				fromInternalProductId: "seat_a_internal",
				toInternalProductId: "seat_b_internal",
			}),
		).toEqual({
			fromInternalProductId: "seat_a_internal",
			toInternalProductId: "seat_b_internal",
		});
	});
});
