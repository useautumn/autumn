import { describe, expect, test } from "bun:test";
import type {
	TrackDeduction,
	TrackResponseV2,
	TrackResponseV3,
} from "@autumn/shared";
import { V2_0_TrackChange } from "@autumn/shared/api/balances/track/changes/V2.0_TrackChange";

const buildDeductions = (): TrackDeduction[] => [
	{
		balance_id: "cus_ent_messages",
		feature_id: "messages",
		value: 4,
	},
];

describe("V2_0_TrackChange deduction strip", () => {
	test("does not leak the deductions field to V2.0 clients", () => {
		const transform = new V2_0_TrackChange();
		const input: TrackResponseV3 = {
			customer_id: "cus_1",
			entity_id: undefined,
			event_name: undefined,
			value: 4,
			balance: null,
			balances: undefined,
			deductions: buildDeductions(),
		};

		const transformed = transform.transformResponse({
			input,
		}) as TrackResponseV2;

		expect(transformed).not.toHaveProperty("deductions");
		expect(transformed.customer_id).toBe("cus_1");
		expect(transformed.value).toBe(4);
		expect(transformed.balance).toBeNull();
	});
});
