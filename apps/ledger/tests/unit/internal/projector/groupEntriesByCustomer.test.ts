import { describe, expect, it } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { LedgerEntry } from "../../../../src/api/journal/types/ledgerEntry.js";
import { groupEntriesByCustomer } from "../../../../src/internal/projector/groupEntriesByCustomer.js";

const entryFor = ({
	internalCustomerId,
	version,
}: {
	internalCustomerId: string;
	version: number;
}): LedgerEntry => ({
	schema_version: 1,
	id: `le_${internalCustomerId}_${version}`,
	org_id: "org_1",
	env: AppEnv.Sandbox,
	customer_id: "cus_1",
	internal_customer_id: internalCustomerId,
	shard_id: 3,
	version,
	at: 1_700_000_000_000,
	recorded_at: 1_700_000_000_001,
	command: { id: `cmd_${version}`, kind: "track" },
	kind: "balance_deducted",
	changes: [
		{
			table: "customer_entitlements",
			op: "update",
			id: "ce_1",
			set: { balance: 100 - version, adjustment: null },
		},
	],
	facts: {
		requests: [],
		deductions: [],
		remaining_by_feature_id: {},
		overage_behaviour: "cap",
	},
});

describe("groupEntriesByCustomer", () => {
	it("keeps log order inside each customer and first-offset order between them", () => {
		const decoded = [
			{
				entry: entryFor({ internalCustomerId: "icus_a", version: 1 }),
				offset: 0,
			},
			{
				entry: entryFor({ internalCustomerId: "icus_b", version: 1 }),
				offset: 1,
			},
			{
				entry: entryFor({ internalCustomerId: "icus_a", version: 2 }),
				offset: 2,
			},
		];

		const groups = groupEntriesByCustomer({ decoded });

		expect(groups.map((group) => group.internalCustomerId)).toEqual([
			"icus_a",
			"icus_b",
		]);
		expect(groups[0].entries.map(({ entry }) => entry.version)).toEqual([1, 2]);
	});
});
