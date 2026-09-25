import { describe, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import type {
	RowChange,
	SubjectState,
	WorkerCustomerEntitlement,
} from "../../../src/balanceEngine.js";
import {
	applyChanges,
	createSubjectState,
	StaleMutationError,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";

const ROW_ID = "messages_monthly";

const stateWith = ({
	row,
	rollovers = [],
	usageWindows = [],
}: {
	row: Partial<WorkerCustomerEntitlement>;
	rollovers?: SubjectState["rollovers"];
	usageWindows?: SubjectState["usageWindows"];
}): SubjectState =>
	createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			{ ...createCustomerEntitlement({ balance: 10 }), ...row },
		],
		rollovers,
		usageWindows,
	});

const rowOf = (state: SubjectState) => {
	const row = state.customerEntitlements.find(
		(candidate) => candidate.id === ROW_ID,
	);
	if (!row) throw new Error("row missing");
	return row;
};

const increment = (
	fields: Partial<
		Extract<RowChange, { op: "increment"; table: "customerEntitlements" }>
	>,
): RowChange => ({
	table: "customerEntitlements",
	op: "increment",
	id: ROW_ID,
	add: {},
	...fields,
});

describe("applying an increment", () => {
	test("adds the exact delta to a counter, never reading it as a float sum", () => {
		const after = applyChanges({
			state: stateWith({ row: { balance: 0.3 } }),
			changes: [increment({ add: { balance: -0.1 } })],
		});

		expect(rowOf(after).balance).toBe(0.2);
	});

	test("adds inside an existing map entry and seeds a missing entity entry with its id", () => {
		const after = applyChanges({
			state: stateWith({
				row: {
					entities: { ent_a: { id: "ent_a", balance: 10, adjustment: 0 } },
				},
			}),
			changes: [
				increment({
					addEntries: {
						entities: { ent_a: { balance: -4 }, ent_b: { balance: -2 } },
					},
				}),
			],
		});

		expect(rowOf(after).entities).toEqual({
			ent_a: { id: "ent_a", balance: 6, adjustment: 0 },
			ent_b: { id: "ent_b", balance: -2, adjustment: 0 },
		});
	});

	test("an attribution entry that reaches zero leaves the map; an entity at zero stays", () => {
		const after = applyChanges({
			state: stateWith({
				row: {
					entities: { ent_a: { id: "ent_a", balance: 4, adjustment: 0 } },
					usage_attribution: {
						feat_a: { units: 15, credits: 12.5 },
						feat_b: { units: 2, credits: 1 },
					},
				},
			}),
			changes: [
				increment({
					addEntries: {
						entities: { ent_a: { balance: -4 } },
						usage_attribution: {
							feat_a: { units: -15, credits: -12.5 },
							feat_b: { units: 1, credits: 0.5 },
						},
					},
				}),
			],
		});

		expect(rowOf(after).entities).toEqual({
			ent_a: { id: "ent_a", balance: 0, adjustment: 0 },
		});
		expect(rowOf(after).usage_attribution).toEqual({
			feat_b: { units: 3, credits: 1.5 },
		});
	});

	test("a missing attribution map is created from the first increment", () => {
		const after = applyChanges({
			state: stateWith({ row: { usage_attribution: undefined } }),
			changes: [
				increment({
					addEntries: {
						usage_attribution: { feat_a: { units: 3, credits: 0 } },
					},
				}),
			],
		});

		expect(rowOf(after).usage_attribution).toEqual({
			feat_a: { units: 3, credits: 0 },
		});
	});

	test("refuses a row that is gone or whose guard no longer holds", () => {
		const state = stateWith({ row: { balance: 10 } });

		expect(() =>
			applyChanges({
				state,
				changes: [increment({ id: "elsewhere", add: { balance: -1 } })],
			}),
		).toThrow(StaleMutationError);
		expect(() =>
			applyChanges({
				state,
				changes: [
					increment({ add: { balance: -1 }, guard: { next_reset_at: 5 } }),
				],
			}),
		).toThrow(StaleMutationError);
		expect(
			rowOf(
				applyChanges({
					state,
					changes: [
						increment({ add: { balance: -1 }, guard: { next_reset_at: null } }),
					],
				}),
			).balance,
		).toBe(9);
	});

	test("reverting an increment restores the row exactly, pruned entries included", () => {
		const state = stateWith({
			row: {
				balance: 100,
				usage_attribution: { feat_a: { units: 15, credits: 12.5 } },
			},
		});
		const change = increment({
			add: { balance: 12.5 },
			addEntries: {
				usage_attribution: { feat_a: { units: -15, credits: -12.5 } },
			},
		});

		const applied = applyChanges({ state, changes: [change] });
		expect(rowOf(applied).usage_attribution).toEqual({});
	});
});

describe("an increment under a concurrent writer", () => {
	test("a reset that landed between decide and commit is kept; the usage comes off the new grant", () => {
		const decidedOn = stateWith({ row: { balance: 10 } });
		const outcome = deduct({
			fullSubject: createSubjectFor({ state: decidedOn }),
			request: {
				featureId: "messages",
				internalFeatureId: "feat_messages",
				value: 6,
				overageBehavior: "cap",
				includesCreditSystems: true,
				enforcesSpendLimit: true,
				countsUsageWindows: true,
				properties: null,
				enforceOverdueBlock: false,
				now: occurredAt,
				org,
			},
		});
		const resetElsewhere = stateWith({
			row: { balance: 100, next_reset_at: 2 },
		});

		const committed = applyChanges({
			state: resetElsewhere,
			changes: outcome.changes,
		});
		expect(rowOf(committed)).toMatchObject({ balance: 94, next_reset_at: 2 });
	});

	test("two increments decided against the same row commute", () => {
		const first = increment({ add: { balance: -5 } });
		const second = increment({ add: { balance: -7 } });
		const state = stateWith({ row: { balance: 100 } });

		const forward = applyChanges({ state, changes: [first, second] });
		const reversed = applyChanges({ state, changes: [second, first] });
		expect(rowOf(forward).balance).toBe(88);
		expect(rowOf(reversed).balance).toBe(88);
	});

	test("an entity another writer created survives the decided entity's move", () => {
		const state = stateWith({
			row: {
				entities: {
					ent_a: { id: "ent_a", balance: 10, adjustment: 0 },
					ent_new: { id: "ent_new", balance: 50, adjustment: 0 },
				},
			},
		});

		const after = applyChanges({
			state,
			changes: [
				increment({ addEntries: { entities: { ent_a: { balance: -3 } } } }),
			],
		});
		expect(rowOf(after).entities).toEqual({
			ent_a: { id: "ent_a", balance: 7, adjustment: 0 },
			ent_new: { id: "ent_new", balance: 50, adjustment: 0 },
		});
	});

	test("a window consume refuses a window another writer rolled, and adds to one it only advanced", () => {
		const window = {
			id: "uw_1",
			internal_customer_id: "cus_1",
			internal_entity_id: null,
			feature_id: "messages",
			internal_feature_id: "feat_messages",
			filter_key: null,
			anchor_customer_entitlement_id: null,
			window_start_at: 1,
			window_end_at: 2,
			usage: 3,
			updated_at: occurredAt,
		};
		const consume: RowChange = {
			table: "usageWindows",
			op: "increment",
			id: "uw_1",
			add: { usage: 5 },
			guard: {
				window_start_at: 1,
				window_end_at: 2,
				anchor_customer_entitlement_id: null,
			},
		};

		const advanced = stateWith({
			row: {},
			usageWindows: [{ ...window, usage: 20 }],
		});
		expect(
			applyChanges({ state: advanced, changes: [consume] }).usageWindows[0]
				?.usage,
		).toBe(25);

		const rolled = stateWith({
			row: {},
			usageWindows: [
				{ ...window, window_start_at: 2, window_end_at: 3, usage: 1 },
			],
		});
		expect(() => applyChanges({ state: rolled, changes: [consume] })).toThrow(
			StaleMutationError,
		);
	});
});

describe("what a deduction logs", () => {
	test("a track's balance, rollover and live-window moves are all increments; only a new counter is inserted", () => {
		const state = createSubjectState({
			identity,
			customer: {
				internal_id: "cus_1",
				id: "cus_1",
				config: null,
				spend_limits: null,
				overage_allowed: null,
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 100,
						interval: ResetInterval.Day,
					},
				],
			},
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
			rollovers: [
				{
					id: "ro_1",
					cus_ent_id: ROW_ID,
					balance: 3,
					usage: 0,
					expires_at: null,
					entities: {},
				},
			],
		});
		const outcome = deduct({
			fullSubject: createSubjectFor({ state }),
			request: {
				featureId: "messages",
				internalFeatureId: "feat_messages",
				value: 5,
				overageBehavior: "cap",
				includesCreditSystems: true,
				enforcesSpendLimit: true,
				countsUsageWindows: true,
				properties: null,
				enforceOverdueBlock: false,
				now: occurredAt,
				org,
			},
		});

		expect(outcome.changes.map((change) => [change.table, change.op])).toEqual([
			["customerEntitlements", "increment"],
			["rollovers", "increment"],
			["usageWindows", "insert"],
		]);
		expect(outcome.changes[0]).toMatchObject({ add: { balance: -2 } });
		expect(outcome.changes[1]).toMatchObject({
			add: { balance: -3, usage: 3 },
		});
	});
});
