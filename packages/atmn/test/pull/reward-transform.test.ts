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
