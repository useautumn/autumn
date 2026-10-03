import { describe, expect, test } from "bun:test";
import { snapshotDivergenceOf } from "../../../../../src/processor/subject/snapshotLoader/rules/snapshotDivergenceOf.js";
import { createState } from "../../../../fixtures/mutations.js";

describe("snapshotDivergenceOf", () => {
	test("a row written from the same rows diverges nowhere, whatever its revision or key order", () => {
		const baseline = createState({ balance: 95 });
		const snapshot = {
			...JSON.parse(JSON.stringify(baseline)),
			revision: 12,
			customer: Object.fromEntries(Object.entries(baseline.customer).reverse()),
		};
		expect(snapshotDivergenceOf({ snapshot, baseline })).toEqual([]);
	});

	test("the fields where the row and the rows disagree, named in the state's order", () => {
		const baseline = createState({ balance: 95 });
		const snapshot = {
			...createState({ balance: 90 }),
			rollovers: [
				{
					id: "ro_1",
					cus_ent_id: "ce_1",
					balance: 5,
					usage: 0,
					expires_at: null,
					entities: {},
				},
			],
			entity: null,
		};
		expect(snapshotDivergenceOf({ snapshot, baseline })).toEqual([
			"customerEntitlements",
			"rollovers",
		]);
	});
});
