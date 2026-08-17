import { expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	BillingInterval,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import {
	buildPlanChange,
	buildPlanItemChangesFromLists,
} from "@/internal/catalogV2/actions/buildPlanChange/index.js";

const plan = (overrides: Partial<ApiPlanV1> = {}): ApiPlanV1 =>
	({
		id: "pro",
		name: "Pro",
		description: null,
		group: null,
		version: 1,
		add_on: false,
		auto_enable: false,
		price: null,
		items: [],
		created_at: 1,
		env: "sandbox",
		archived: false,
		base_variant_id: null,
		config: { ignore_past_due: false },
		billing_controls: {},
		metadata: {},
		...overrides,
	}) as ApiPlanV1;

const messagesItem = ({
	included = 100,
}: {
	included?: number;
} = {}): ApiPlanItemV1 =>
	({
		feature_id: "messages",
		included,
		unlimited: false,
		reset: { interval: ResetInterval.Month },
		price: null,
	}) as ApiPlanItemV1;

const seatsItem = (): ApiPlanItemV1 =>
	({
		feature_id: "seats",
		included: 5,
		unlimited: false,
		reset: null,
		price: null,
	}) as ApiPlanItemV1;

const monthPrice = (amount: number) => ({
	amount,
	interval: BillingInterval.Month,
});

const trial = ({
	duration_length = 14,
}: {
	duration_length?: number;
} = {}) => ({
	duration_length,
	duration_type: FreeTrialDuration.Day,
	card_required: true,
});

test("name-only change returns previous_attributes", () => {
	const change = buildPlanChange({
		from: plan({ name: "Pro" }),
		to: plan({ name: "Pro Plus" }),
	});

	expect(change).toMatchObject({
		previous_attributes: { name: "Pro" },
		item_changes: [],
	});
	expect(change?.price_change).toBeUndefined();
	expect(change?.free_trial_change).toBeUndefined();
	expect(change?.plan).toBeUndefined();
});

test("price add/change/remove", () => {
	const added = buildPlanChange({
		from: plan({ price: null }),
		to: plan({ price: monthPrice(10) }),
	});
	expect(added?.price_change).toEqual({
		previous: null,
		current: monthPrice(10),
	});
	expect(added?.previous_attributes).toBeNull();

	const changed = buildPlanChange({
		from: plan({ price: monthPrice(10) }),
		to: plan({ price: monthPrice(20) }),
	});
	expect(changed?.price_change).toEqual({
		previous: monthPrice(10),
		current: monthPrice(20),
	});

	const removed = buildPlanChange({
		from: plan({ price: monthPrice(10) }),
		to: plan({ price: null }),
	});
	expect(removed?.price_change).toEqual({
		previous: monthPrice(10),
		current: null,
	});
});

test("item add/remove", () => {
	const from = plan({ items: [messagesItem()] });
	const to = plan({ items: [seatsItem()] });

	const change = buildPlanChange({ from, to });

	expect(change?.item_changes.map((c) => c.action)).toEqual([
		"deleted",
		"created",
	]);
	expect(change?.item_changes[0]).toMatchObject({
		action: "deleted",
		feature_id: "messages",
		item: messagesItem(),
	});
	expect(change?.item_changes[1]).toMatchObject({
		action: "created",
		feature_id: "seats",
		item: seatsItem(),
	});
	expect(change?.previous_attributes).toBeNull();
	expect(change?.price_change).toBeUndefined();
});

test("trial add/change/remove", () => {
	const added = buildPlanChange({
		from: plan(),
		to: plan({ free_trial: trial() }),
	});
	expect(added?.free_trial_change).toEqual({
		previous: null,
		current: trial(),
	});
	expect(added?.previous_attributes).toMatchObject({ free_trial: null });

	const changed = buildPlanChange({
		from: plan({ free_trial: trial({ duration_length: 7 }) }),
		to: plan({ free_trial: trial({ duration_length: 14 }) }),
	});
	expect(changed?.free_trial_change).toEqual({
		previous: trial({ duration_length: 7 }),
		current: trial({ duration_length: 14 }),
	});

	const removed = buildPlanChange({
		from: plan({ free_trial: trial() }),
		to: plan({ free_trial: undefined }),
	});
	expect(removed?.free_trial_change).toEqual({
		previous: trial(),
		current: null,
	});
});

test("no-op returns null", () => {
	const base = plan({
		price: monthPrice(10),
		items: [messagesItem()],
		free_trial: trial(),
	});

	expect(buildPlanChange({ from: base, to: { ...base } })).toBeUndefined();
});

test("buildPlanItemChangesFromLists assembles explicit created/deleted", () => {
	const created = [seatsItem()];
	const deleted = [messagesItem()];

	expect(
		buildPlanItemChangesFromLists({
			createdItems: created,
			deletedItems: deleted,
		}),
	).toEqual([
		{
			action: "deleted",
			feature_id: "messages",
			item: messagesItem(),
		},
		{
			action: "created",
			feature_id: "seats",
			item: seatsItem(),
		},
	]);
});
