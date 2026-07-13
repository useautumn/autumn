import { expect, test } from "bun:test";
import {
	ApiFeatureType,
	type ApiPlanV1,
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
