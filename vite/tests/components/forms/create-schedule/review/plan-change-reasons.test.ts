import { expect, test } from "bun:test";
import type {
	ApiPlanItemV1,
	CustomerPlanChange,
	Feature,
} from "@autumn/shared";
import { planChangeLines } from "@/components/forms/create-schedule/utils/review/planChangeLines";

const JUL_31_2027 = Date.UTC(2027, 6, 31);
const NOW = Date.UTC(2026, 8, 30);

const change = (overrides: Partial<CustomerPlanChange>): CustomerPlanChange =>
	({
		entity_id: null,
		action: "updated",
		subscription: {
			plan_id: "enterprise",
			expires_at: null,
			trial_ends_at: null,
			canceled_at: null,
			past_due: false,
		},
		previous_attributes: null,
		item_changes: [],
		...overrides,
	}) as CustomerPlanChange;

const planChange = (
	planChangeFields: Partial<NonNullable<CustomerPlanChange["plan_change"]>>,
) =>
	change({
		plan_change: {
			item_changes: [],
			...planChangeFields,
		} as unknown as CustomerPlanChange["plan_change"],
	});

const features = [
	{ id: "sso", name: "SSO" },
	{ id: "ai_credits", name: "AI Credits" },
	{ id: "agent_analytics", name: "Agent Analytics" },
] as Feature[];

const includedCredits = (included: number) =>
	({
		feature_id: "ai_credits",
		included,
		unlimited: false,
		reset: { interval: "month" },
		price: null,
	}) as unknown as ApiPlanItemV1;

const creditOverage = (amount: number) =>
	({
		feature_id: "ai_credits",
		included: 0,
		unlimited: false,
		reset: { interval: "month" },
		price: { amount, interval: "month", billing_units: 1 },
	}) as unknown as ApiPlanItemV1;

const flag = (featureId: string) =>
	({
		feature_id: featureId,
		included: 0,
		unlimited: false,
		reset: null,
		price: null,
	}) as unknown as ApiPlanItemV1;

const linesFor = (planChangeWithFields: CustomerPlanChange) =>
	planChangeLines({
		change: planChangeWithFields,
		features,
		currency: "usd",
	});

test("a plan whose end date was dropped says it no longer ends", () => {
	expect(
		linesFor(change({ previous_attributes: { expires_at: JUL_31_2027 } })),
	).toEqual([
		{ state: "updated", label: "Ends", before: "Jul 31, 2027", after: "Never" },
	]);
});

test("lifecycle changes each get a labelled line", () => {
	expect(
		linesFor(
			change({ previous_attributes: { past_due: true, canceled_at: NOW } }),
		),
	).toEqual([
		{ state: "updated", label: "Cancellation", after: "Removed" },
		{ state: "updated", label: "Past due", after: "Resolved" },
	]);
});

test("a price change shows the old and new price", () => {
	expect(
		linesFor(
			planChange({
				price_change: {
					previous: { amount: 2000, interval: "month" },
					current: { amount: 2500, interval: "month" },
				},
			} as never),
		),
	).toEqual([
		{
			state: "updated",
			label: "Price",
			before: "$2,000",
			after: "$2,500 /mo",
		},
	]);
});

test("an item removed and re-added for the same feature reads as one change", () => {
	expect(
		linesFor(
			planChange({
				item_changes: [
					{
						action: "deleted",
						feature_id: "ai_credits",
						item: includedCredits(10_000),
					},
					{
						action: "deleted",
						feature_id: "ai_credits",
						item: creditOverage(0.01),
					},
					{
						action: "created",
						feature_id: "ai_credits",
						item: includedCredits(100_000),
					},
					{
						action: "created",
						feature_id: "ai_credits",
						item: creditOverage(0.01),
					},
				],
			}),
		),
	).toEqual([
		{
			state: "updated",
			label: "AI Credits",
			before: "10,000",
			after: "100,000 /mo",
		},
	]);
});

test("only the overage price changing shows the per-unit price change", () => {
	expect(
		linesFor(
			planChange({
				item_changes: [
					{
						action: "deleted",
						feature_id: "ai_credits",
						item: creditOverage(0.01),
					},
					{
						action: "created",
						feature_id: "ai_credits",
						item: creditOverage(0.02),
					},
				],
			}),
		),
	).toEqual([
		{
			state: "updated",
			label: "AI Credits",
			before: "$0.01",
			after: "$0.02 /unit",
		},
	]);
});

test("added and removed features are listed by name", () => {
	expect(
		linesFor(
			planChange({
				item_changes: [
					{ action: "created", feature_id: "sso", item: flag("sso") },
					{
						action: "deleted",
						feature_id: "agent_analytics",
						item: flag("agent_analytics"),
					},
					{
						action: "deleted",
						feature_id: "audit_logs",
						item: flag("audit_logs"),
					},
				],
			}),
		),
	).toEqual([
		{ state: "new", label: "SSO", after: "Added" },
		{ state: "removed", label: "Agent Analytics", after: "Removed" },
		{ state: "removed", label: "audit_logs", after: "Removed" },
	]);
});
