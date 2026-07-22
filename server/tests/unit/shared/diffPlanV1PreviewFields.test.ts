import { expect, test } from "bun:test";
import {
	ApiFeatureType,
	type ApiPlanV1,
	BillingInterval,
	diffPlanV1,
	diffPlanV1PreviewFields,
	ResetInterval,
} from "@autumn/shared";

const plan = (overrides: Partial<ApiPlanV1>): ApiPlanV1 =>
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

const planWithInternalIds = ({
	amount,
	included,
	priceId,
	entitlementId,
}: {
	amount: number;
	included: number;
	priceId: string;
	entitlementId: string;
}) =>
	plan({
		price: {
			amount,
			interval: BillingInterval.Month,
			price_id: priceId,
		},
		items: [
			{
				feature_id: "messages",
				included,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: null,
				entitlement_id: entitlementId,
			},
		],
	});

test("diffPlanV1PreviewFields returns item and customize preview fields", () => {
	const from = plan({
		items: [
			{
				feature_id: "messages",
				included: 100,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: null,
			},
		],
	});
	const to = plan({
		items: [
			{
				feature_id: "messages",
				included: 200,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: null,
			},
		],
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.customize).toMatchObject({
		add_items: [{ feature_id: "messages", included: 200 }],
		remove_items: [{ feature_id: "messages", interval: "month" }],
	});
	expect(diff.item_changes.map((change) => change.action)).toEqual([
		"deleted",
		"created",
	]);
	expect(diff.previous_attributes).toBeNull();
});

test("diffPlanV1PreviewFields returns scalar previous attributes", () => {
	const diff = diffPlanV1PreviewFields({
		from: plan({ name: "Pro", group: "paid" }),
		to: plan({ name: "Pro Plus", group: "paid" }),
	});

	expect(diff.previous_attributes).toEqual({ name: "Pro" });
	expect(diff.customize).toBeNull();
	expect(diff.item_changes).toEqual([]);
});

test("diffPlanV1PreviewFields ignores generated item display fields", () => {
	const from = plan({
		items: [
			{
				feature_id: "messages",
				included: 1800,
				unlimited: false,
				reset: { interval: ResetInterval.Year },
				price: null,
				display: { primary_text: "1,800 Messages" },
			},
		],
	});
	const to = plan({
		items: [
			{
				feature_id: "messages",
				included: 1800,
				unlimited: false,
				reset: { interval: ResetInterval.Year },
				price: null,
			},
		],
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.customize).toBeNull();
	expect(diff.previous_attributes).toBeNull();
	expect(diff.item_changes).toEqual([]);
});

test("diffPlanV1PreviewFields ignores joined item feature fields", () => {
	const from = plan({
		items: [
			{
				feature_id: "messages",
				feature: {
					id: "messages",
					name: "Messages",
					type: ApiFeatureType.SingleUsage,
				},
				included: 1800,
				unlimited: false,
				reset: { interval: ResetInterval.Year },
				price: null,
			},
		],
	});
	const to = plan({
		items: [
			{
				feature_id: "messages",
				included: 1800,
				unlimited: false,
				reset: { interval: ResetInterval.Year },
				price: null,
			},
		],
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.customize).toBeNull();
	expect(diff.previous_attributes).toBeNull();
	expect(diff.item_changes).toEqual([]);
});

test("diffPlanV1 ignores internal price and entitlement ids", () => {
	const from = planWithInternalIds({
		amount: 20,
		included: 100,
		priceId: "price_old",
		entitlementId: "ent_old",
	});
	const to = planWithInternalIds({
		amount: 20,
		included: 100,
		priceId: "price_new",
		entitlementId: "ent_new",
	});

	expect(diffPlanV1({ from, to })).toEqual({});
});

test("diffPlanV1 does not emit internal ids with semantic changes", () => {
	const from = planWithInternalIds({
		amount: 20,
		included: 100,
		priceId: "price_old",
		entitlementId: "ent_old",
	});
	const to = planWithInternalIds({
		amount: 30,
		included: 200,
		priceId: "price_new",
		entitlementId: "ent_new",
	});

	const diff = diffPlanV1({ from, to });

	expect(diff.price).not.toHaveProperty("price_id");
	expect(diff.add_items?.[0]).not.toHaveProperty("entitlement_id");
});

test("diffPlanV1 preserves pooled true in emitted item params", () => {
	const from = plan({ items: [] });
	const to = plan({
		items: [
			{
				feature_id: "messages",
				included: 100,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: null,
				pooled: true,
			},
		],
	});

	const diff = diffPlanV1({ from, to });

	// Red before the fix: toCreatePlanItemParams drops the pooled flag.
	// Green after the fix: consumers receive the requested pooled semantics.
	expect(diff.add_items?.[0]).toMatchObject({
		feature_id: "messages",
		pooled: true,
	});
});

test("diffPlanV1 treats a pooled flip as a semantic item change", () => {
	const item = {
		feature_id: "messages",
		included: 100,
		unlimited: false,
		reset: { interval: ResetInterval.Month },
		price: null,
	};
	const from = plan({ items: [{ ...item, pooled: true }] });
	const to = plan({ items: [{ ...item, pooled: false }] });

	const diff = diffPlanV1({ from, to });

	// Red before the fix: itemsEqual ignores pooled and returns an empty diff.
	// Green after the fix: the flip is represented as the standard remove + add.
	expect(diff.remove_items).toEqual([
		{
			feature_id: "messages",
			interval: ResetInterval.Month,
			interval_count: 1,
		},
	]);
	expect(diff.add_items).toEqual([
		{
			feature_id: "messages",
			included: 100,
			unlimited: false,
			reset: { interval: ResetInterval.Month },
		},
	]);
});

test("billing_controls: skip_overage_billing false vs unset is not a change", () => {
	const from = plan({
		billing_controls: {
			spend_limits: [
				{ feature_id: "messages", enabled: true, overage_limit: 100 },
			],
		},
	});
	const to = plan({
		billing_controls: {
			spend_limits: [
				{
					feature_id: "messages",
					enabled: true,
					overage_limit: 100,
					skip_overage_billing: false,
				},
			],
		},
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.previous_attributes).toBeNull();
});

test("billing_controls: skip_overage_billing true vs unset is a change", () => {
	const from = plan({
		billing_controls: {
			spend_limits: [
				{ feature_id: "messages", enabled: true, overage_limit: 100 },
			],
		},
	});
	const to = plan({
		billing_controls: {
			spend_limits: [
				{
					feature_id: "messages",
					enabled: true,
					overage_limit: 100,
					skip_overage_billing: true,
				},
			],
		},
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.previous_attributes).toMatchObject({
		billing_controls: from.billing_controls,
	});
});
