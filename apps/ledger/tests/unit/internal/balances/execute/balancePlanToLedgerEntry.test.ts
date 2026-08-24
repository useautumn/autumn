import { describe, expect, it } from "bun:test";
import { AppEnv, type TrackParams } from "@autumn/shared";
import { LedgerEntrySchema } from "../../../../../src/api/journal/types/ledgerEntry.js";
import type { Command } from "../../../../../src/api/types/command.js";
import type { TrackContext } from "../../../../../src/internal/balances/actions/track/types/trackContext.js";
import type { TrackPlan } from "../../../../../src/internal/balances/actions/track/types/trackPlan.js";
import { balancePlanToLedgerEntry } from "../../../../../src/internal/balances/execute/balancePlanToLedgerEntry.js";
import { featureFixture } from "../../../testUtils/customerEntitlementFixture.js";

const AT = 1_700_000_000_000;
const SHARD_ID = 17;

const commandWith = (body: Partial<TrackParams>): Command => ({
	id: "cmd_1",
	org_id: "org_1",
	env: AppEnv.Sandbox,
	customer_id: "cus_1",
	at: AT,
	api_version: "1.2",
	kind: "track",
	body: { customer_id: "cus_1", feature_id: "messages", value: 5, ...body },
});

const trackContextWith = ({ command }: { command: Command }): TrackContext => ({
	command,
	features: [featureFixture()],
	subject: {
		customer: { internal_id: "icus_1" },
		customerProducts: [],
		customerEntitlements: [],
	},
	requests: [{ feature: featureFixture(), amount: 5 }],
	options: { overageBehaviour: "cap", isAllow: false, isConsumption: true },
});

const plan: TrackPlan = {
	mutations: [
		{
			target_type: "customer_entitlement",
			customer_entitlement_id: "ce_1",
			rollover_id: null,
			entity_id: null,
			credit_cost: 1,
			balance_delta: -5,
			adjustment_delta: 0,
			usage_delta: 5,
			value_delta: 5,
		},
	],
	after: { ce_1: { balance: 95, adjustment: 0 } },
	remaining: 0,
	remainingByFeatureId: { messages: 0 },
};

const entryFor = ({ body }: { body: Partial<TrackParams> }) =>
	balancePlanToLedgerEntry({
		trackContext: trackContextWith({ command: commandWith(body) }),
		plan,
		shardId: SHARD_ID,
		version: 3,
	});

describe("balancePlanToLedgerEntry", () => {
	it("carries the envelope the journal is keyed and ordered by", () => {
		const entry = entryFor({ body: {} });

		expect(LedgerEntrySchema.safeParse(entry).success).toBe(true);
		expect(entry).toMatchObject({
			schema_version: 1,
			org_id: "org_1",
			env: AppEnv.Sandbox,
			customer_id: "cus_1",
			internal_customer_id: "icus_1",
			shard_id: SHARD_ID,
			version: 3,
			at: AT,
			kind: "balance_deducted",
			command: { id: "cmd_1", kind: "track", api_version: "1.2" },
		});
		expect(entry.id.startsWith("le_")).toBe(true);
	});

	it("stamps recorded_at from the wall clock, never from the command", () => {
		const before = Date.now();
		const entry = entryFor({ body: {} });

		expect(entry.recorded_at).toBeGreaterThanOrEqual(before);
		expect(entry.recorded_at).not.toBe(entry.at);
	});

	it("writes one absolute update per settled balance", () => {
		expect(entryFor({ body: {} }).changes).toEqual([
			{
				table: "customer_entitlements",
				op: "update",
				id: "ce_1",
				set: { balance: 95, adjustment: 0 },
			},
		]);
	});

	it("carries the deduction facts and the command's event", () => {
		const entry = entryFor({
			body: {
				properties: { model: "opus" },
				idempotency_key: "idem_1",
				timestamp: AT - 5_000,
			},
		});

		expect(entry.facts).toEqual({
			requests: [{ feature_id: "messages", amount: 5 }],
			deductions: plan.mutations,
			remaining_by_feature_id: { messages: 0 },
			overage_behaviour: "cap",
			event: {
				name: "messages",
				value: 5,
				timestamp: AT - 5_000,
				properties: { model: "opus" },
				idempotency_key: "idem_1",
			},
		});
	});

	it("defaults the event timestamp to the command's clock", () => {
		expect(entryFor({ body: {} }).facts.event?.timestamp).toBe(AT);
	});

	it("names the event after event_name when no feature was given", () => {
		const entry = entryFor({
			body: { feature_id: undefined, event_name: "chat" },
		});

		expect(entry.facts.event?.name).toBe("chat");
	});

	it("carries no event when the caller already owns it", () => {
		expect(
			entryFor({ body: { skip_event: true } }).facts.event,
		).toBeUndefined();
	});
});
