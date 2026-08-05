import { expect, test } from "bun:test";
import { transformApiReward } from "../../src/lib/transforms/apiToSdk/reward.js";

test("rejects invoice credit rewards during pull", () => {
	expect(() =>
		transformApiReward({
			id: "legacy-credit",
			name: "Legacy credit",
			type: "invoice_credits",
			value: 10,
			duration: { type: "one_off", length: null },
			plan_ids: null,
			promo_codes: [],
			created_at: 0,
		}),
	).toThrow(
		'Invoice credit reward "legacy-credit" is not supported in autumn.config.ts',
	);
});

for (const length of [0, -1, 1.5]) {
	test(`rejects monthly reward duration ${length} during pull`, () => {
		expect(() =>
			transformApiReward({
				id: "monthly-discount",
				name: "Monthly discount",
				type: "percentage_discount",
				value: 20,
				duration: { type: "months", length },
				plan_ids: null,
				promo_codes: [],
				created_at: 0,
			}),
		).toThrow("Monthly reward duration must be a positive integer");
	});
}
