import { describe, expect, it } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	LEDGER_ENTRY_SCHEMA_VERSION,
	type LedgerEntry,
	LedgerEntrySchema,
} from "../../../../src/api/journal/types/ledgerEntry.js";

const entry: LedgerEntry = {
	schema_version: LEDGER_ENTRY_SCHEMA_VERSION,
	id: "le_1",
	org_id: "org_1",
	env: AppEnv.Sandbox,
	customer_id: "cus_1",
	internal_customer_id: "icus_1",
	shard_id: 17,
	version: 1,
	at: 1_700_000_000_000,
	recorded_at: 1_700_000_000_123,
	command: { id: "cmd_1", kind: "track", api_version: "1.2" },
	kind: "balance_deducted",
	changes: [
		{
			table: "customer_entitlements",
			op: "update",
			id: "ce_1",
			set: { balance: 95, adjustment: 0 },
		},
	],
	facts: {
		requests: [{ feature_id: "messages", amount: 5 }],
		deductions: [],
		remaining_by_feature_id: { messages: 0 },
		overage_behaviour: "cap",
		event: { name: "messages", value: 5, timestamp: 1_700_000_000_000 },
	},
};

describe("LedgerEntrySchema", () => {
	it("round-trips through JSON unchanged", () => {
		const decoded = LedgerEntrySchema.parse(
			JSON.parse(JSON.stringify(entry)) as unknown,
		);

		expect(decoded).toEqual(entry);
	});

	it("keeps an update's `set` partial — an absent column stays absent", () => {
		const decoded = LedgerEntrySchema.parse({
			...entry,
			changes: [
				{
					table: "customer_entitlements",
					op: "update",
					id: "ce_1",
					set: { balance: 95 },
				},
			],
		});

		expect(decoded.changes[0]).toEqual({
			table: "customer_entitlements",
			op: "update",
			id: "ce_1",
			set: { balance: 95 },
		});
	});

	it("rejects an entry whose kind it does not know", () => {
		const parsed = LedgerEntrySchema.safeParse({ ...entry, kind: "invented" });

		expect(parsed.success).toBe(false);
	});

	it("rejects version 0 — the sequence starts at the first entry", () => {
		const parsed = LedgerEntrySchema.safeParse({ ...entry, version: 0 });

		expect(parsed.success).toBe(false);
	});
});
