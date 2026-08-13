import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	customizeToKey,
	type DiffedCustomizePlanV1,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";

const messages = {
	feature_id: "messages",
	included: 100,
	reset: { interval: ResetInterval.Month },
};
const seats = { feature_id: "seats", included: 5 };

const customize = (overrides: Record<string, unknown> = {}) =>
	overrides as DiffedCustomizePlanV1;

const keyOf = (value: DiffedCustomizePlanV1) => customizeToKey({ customize: value });

const expectSame = (
	a: DiffedCustomizePlanV1,
	b: DiffedCustomizePlanV1,
	expected: boolean,
) => {
	expect(keyOf(a) === keyOf(b)).toBe(expected);
	expect(keyOf(b) === keyOf(a)).toBe(expected);
};

describe("customizeToKey", () => {
	test("empty customizes are same", () => {
		expectSame(customize(), customize({}), true);
	});

	describe("price (tri-state: omitted vs null vs object)", () => {
		const set = { amount: 20, interval: BillingInterval.Month };

		test("omitted vs null vs object are all distinct", () => {
			expectSame(customize(), customize({ price: null }), false);
			expectSame(customize(), customize({ price: set }), false);
			expectSame(customize({ price: null }), customize({ price: set }), false);
		});

		test("equal objects are same; interval_count unset equals 1", () => {
			expectSame(customize({ price: set }), customize({ price: { ...set } }), true);
			expectSame(
				customize({ price: set }),
				customize({ price: { ...set, interval_count: 1 } }),
				true,
			);
			expectSame(
				customize({ price: set }),
				customize({ price: { ...set, interval_count: 2 } }),
				false,
			);
		});
	});

	describe("add_items", () => {
		test("omitted, null, and empty are same", () => {
			expectSame(customize(), customize({ add_items: [] }), true);
			expectSame(customize({ add_items: null }), customize({ add_items: [] }), true);
		});

		test("order does not matter", () => {
			expectSame(
				customize({ add_items: [messages, seats] }),
				customize({ add_items: [seats, messages] }),
				true,
			);
		});

		test("duplicate is not the same as one", () => {
			expectSame(
				customize({ add_items: [messages, messages] }),
				customize({ add_items: [messages] }),
				false,
			);
		});

		test("payload differences split the key", () => {
			expectSame(
				customize({ add_items: [{ feature_id: "messages", included: 100 }] }),
				customize({ add_items: [{ feature_id: "messages", included: 200 }] }),
				false,
			);
			expectSame(
				customize({ add_items: [{ feature_id: "messages" }] }),
				customize({ add_items: [{ feature_id: "seats" }] }),
				false,
			);
		});

		test("item defaults collapse (included 0 / unlimited false / pooled false)", () => {
			expectSame(
				customize({ add_items: [{ feature_id: "messages" }] }),
				customize({
					add_items: [
						{
							feature_id: "messages",
							included: 0,
							unlimited: false,
							pooled: false,
						},
					],
				}),
				true,
			);
		});
	});

	describe("remove_items", () => {
		test("omitted, null, and empty are same", () => {
			expectSame(customize(), customize({ remove_items: [] }), true);
			expectSame(
				customize({ remove_items: null }),
				customize({ remove_items: [] }),
				true,
			);
		});

		test("order does not matter", () => {
			expectSame(
				customize({
					remove_items: [
						{ feature_id: "messages", billing_method: BillingMethod.UsageBased },
						{ feature_id: "seats" },
					],
				}),
				customize({
					remove_items: [
						{ feature_id: "seats" },
						{ feature_id: "messages", billing_method: BillingMethod.UsageBased },
					],
				}),
				true,
			);
		});

		test("add_items vs remove_items of the same feature differ", () => {
			expectSame(
				customize({ add_items: [{ feature_id: "messages" }] }),
				customize({ remove_items: [{ feature_id: "messages" }] }),
				false,
			);
		});
	});

	describe("remove_items filter — feature_id (strict)", () => {
		test("equal ids are same, different ids differ", () => {
			expectSame(
				customize({ remove_items: [{ feature_id: "messages" }] }),
				customize({ remove_items: [{ feature_id: "messages" }] }),
				true,
			);
			expectSame(
				customize({ remove_items: [{ feature_id: "messages" }] }),
				customize({ remove_items: [{ feature_id: "seats" }] }),
				false,
			);
		});
	});

	describe("remove_items filter — billing_method (unset collapses)", () => {
		test("unset / null are same; unset vs a method differ", () => {
			expectSame(
				customize({ remove_items: [{ feature_id: "messages" }] }),
				customize({
					remove_items: [{ feature_id: "messages", billing_method: null }],
				}),
				true,
			);
			expectSame(
				customize({ remove_items: [{ feature_id: "messages" }] }),
				customize({
					remove_items: [
						{ feature_id: "messages", billing_method: BillingMethod.Prepaid },
					],
				}),
				false,
			);
			expectSame(
				customize({
					remove_items: [
						{ feature_id: "messages", billing_method: BillingMethod.Prepaid },
					],
				}),
				customize({
					remove_items: [
						{
							feature_id: "messages",
							billing_method: BillingMethod.UsageBased,
						},
					],
				}),
				false,
			);
		});
	});

	describe("remove_items filter — interval (unset collapses)", () => {
		test("unset vs a real interval differ; equal intervals are same", () => {
			expectSame(
				customize({ remove_items: [{ feature_id: "messages" }] }),
				customize({
					remove_items: [
						{ feature_id: "messages", interval: ResetInterval.Month },
					],
				}),
				false,
			);
			expectSame(
				customize({
					remove_items: [
						{ feature_id: "messages", interval: ResetInterval.Month },
					],
				}),
				customize({
					remove_items: [
						{ feature_id: "messages", interval: ResetInterval.Year },
					],
				}),
				false,
			);
		});
	});

	describe("remove_items filter — interval_count (unset means 1 only when interval is set)", () => {
		test("with interval, unset equals 1; 1 vs 2 differ", () => {
			expectSame(
				customize({
					remove_items: [
						{ feature_id: "messages", interval: ResetInterval.Month },
					],
				}),
				customize({
					remove_items: [
						{
							feature_id: "messages",
							interval: ResetInterval.Month,
							interval_count: 1,
						},
					],
				}),
				true,
			);
			expectSame(
				customize({
					remove_items: [
						{
							feature_id: "messages",
							interval: ResetInterval.Month,
							interval_count: 1,
						},
					],
				}),
				customize({
					remove_items: [
						{
							feature_id: "messages",
							interval: ResetInterval.Month,
							interval_count: 2,
						},
					],
				}),
				false,
			);
		});

		test("without interval, a bare count does not collapse onto interval + 1", () => {
			expectSame(
				customize({
					remove_items: [{ feature_id: "messages", interval_count: 1 }],
				}),
				customize({
					remove_items: [
						{
							feature_id: "messages",
							interval: ResetInterval.Month,
							interval_count: 1,
						},
					],
				}),
				false,
			);
			expectSame(
				customize({ remove_items: [{ feature_id: "messages" }] }),
				customize({
					remove_items: [{ feature_id: "messages", interval_count: 1 }],
				}),
				false,
			);
		});
	});

	describe("free_trial (tri-state: omitted vs null vs object)", () => {
		const set = {
			duration_length: 14,
			duration_type: FreeTrialDuration.Day,
		};

		test("omitted vs null vs object are all distinct", () => {
			expectSame(customize(), customize({ free_trial: null }), false);
			expectSame(customize(), customize({ free_trial: set }), false);
			expectSame(customize({ free_trial: null }), customize({ free_trial: set }), false);
		});
	});

	describe("free_trial.duration_length", () => {
		test("equal lengths are same, different lengths differ", () => {
			expectSame(
				customize({ free_trial: { duration_length: 7 } }),
				customize({ free_trial: { duration_length: 7 } }),
				true,
			);
			expectSame(
				customize({ free_trial: { duration_length: 7 } }),
				customize({ free_trial: { duration_length: 14 } }),
				false,
			);
		});

		test("0 is preserved", () => {
			expectSame(
				customize({ free_trial: { duration_length: 0 } }),
				customize({ free_trial: { duration_length: 1 } }),
				false,
			);
		});
	});

	describe("free_trial.duration_type (unset means month)", () => {
		test("unset equals month; month vs day differ", () => {
			expectSame(
				customize({ free_trial: { duration_length: 1 } }),
				customize({
					free_trial: {
						duration_length: 1,
						duration_type: FreeTrialDuration.Month,
					},
				}),
				true,
			);
			expectSame(
				customize({
					free_trial: {
						duration_length: 1,
						duration_type: FreeTrialDuration.Month,
					},
				}),
				customize({
					free_trial: {
						duration_length: 1,
						duration_type: FreeTrialDuration.Day,
					},
				}),
				false,
			);
		});
	});

	describe("free_trial.card_required (unset means true)", () => {
		test("unset / null equal true; true vs false differ", () => {
			expectSame(
				customize({ free_trial: { duration_length: 1 } }),
				customize({
					free_trial: { duration_length: 1, card_required: true },
				}),
				true,
			);
			expectSame(
				customize({
					free_trial: { duration_length: 1, card_required: null },
				}),
				customize({
					free_trial: { duration_length: 1, card_required: true },
				}),
				true,
			);
			expectSame(
				customize({
					free_trial: { duration_length: 1, card_required: true },
				}),
				customize({
					free_trial: { duration_length: 1, card_required: false },
				}),
				false,
			);
			expectSame(
				customize({ free_trial: { duration_length: 1 } }),
				customize({
					free_trial: { duration_length: 1, card_required: false },
				}),
				false,
			);
		});
	});

	describe("free_trial.on_end (unset means bill)", () => {
		test("unset equals bill; bill vs revert differ", () => {
			expectSame(
				customize({ free_trial: { duration_length: 1 } }),
				customize({ free_trial: { duration_length: 1, on_end: "bill" } }),
				true,
			);
			expectSame(
				customize({ free_trial: { duration_length: 1, on_end: "bill" } }),
				customize({ free_trial: { duration_length: 1, on_end: "revert" } }),
				false,
			);
			expectSame(
				customize({ free_trial: { duration_length: 1 } }),
				customize({ free_trial: { duration_length: 1, on_end: "revert" } }),
				false,
			);
		});
	});

	describe("non-migratable fields (ignored)", () => {
		test("billing_controls / update_items do not affect the key", () => {
			expectSame(
				customize({ billing_controls: { spend_limits: [] } }),
				customize(),
				true,
			);
			expectSame(
				customize({
					update_items: [{ filter: { feature_id: "messages" }, included: 10 }],
				}),
				customize(),
				true,
			);
		});
	});
});
