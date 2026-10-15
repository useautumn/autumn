import { describe, expect, test } from "bun:test";
import type {
	CustomerPlanChange,
	ProcessorItem,
	SetPlansPreviewBalanceChange,
	SetPlansPreviewPhase,
	SetPlansReviewText,
} from "@autumn/shared";
import { balancesReviewSection } from "@/internal/billing/v2/actions/setPlans/preview/reviewSections/balancesReviewSection";
import { planChangeLines } from "@/internal/billing/v2/actions/setPlans/preview/reviewSections/planChangeLines";
import { subscriptionReviewSection } from "@/internal/billing/v2/actions/setPlans/preview/reviewSections/subscriptionReviewSection";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14);

/** Dates as ISO days, so expectations don't depend on the runner's timezone. */
const text = (parts?: SetPlansReviewText) =>
	parts
		?.map((part) =>
			typeof part === "string"
				? part
				: new Date(part.date).toISOString().slice(0, 10),
		)
		.join("");

const phase = (
	overrides: Partial<SetPlansPreviewPhase>,
): SetPlansPreviewPhase => ({
	starts_at: NOW,
	starts_now: false,
	ends_subscription: false,
	plans: [],
	plan_changes: [],
	balance_changes: [],
	processor_items: [],
	...overrides,
});

const item = (overrides: Partial<ProcessorItem>): ProcessorItem => ({
	price_id: "price_pro",
	plan_id: "pro",
	feature_id: null,
	display_name: "Pro",
	feature_name: null,
	quantity: 1,
	price: {
		currency: "usd",
		unit_amount: 20,
		interval: "month",
		interval_count: 1,
		usage_type: "licensed",
		tiers_mode: null,
		tiers: null,
		units_per_quantity: null,
	},
	amount: 20,
	creates_price: false,
	managed_by_autumn: true,
	...overrides,
});

describe("planChangeLines", () => {
	test("a price change on the same interval reads its suffix once", () => {
		const change = {
			previous_attributes: null,
			plan_change: {
				price_change: {
					previous: { amount: 20, interval: "month" },
					current: { amount: 30, interval: "month" },
				},
				item_changes: [],
			},
		} as unknown as CustomerPlanChange;

		expect(
			planChangeLines({ change, features: [], currency: "usd" }).map((line) => [
				line.label,
				text(line.before),
				text(line.after),
			]),
		).toEqual([["Price", "$20", "$30 /mo"]]);
	});

	test("an edited feature shows its included amount, else its unit price", () => {
		const itemChange = (action: string, included: number, amount: number) => ({
			action,
			feature_id: "messages",
			item: {
				feature_id: "messages",
				included,
				reset: { interval: "month" },
				price: { amount, billing_units: 1 },
			},
		});
		const lines = (changes: unknown[]) =>
			planChangeLines({
				change: {
					previous_attributes: null,
					plan_change: { item_changes: changes },
				} as unknown as CustomerPlanChange,
				features: [{ id: "messages", name: "Messages" }] as never,
				currency: "usd",
			}).map((line) => [line.label, text(line.before), text(line.after)]);

		expect(
			lines([itemChange("deleted", 100, 1), itemChange("created", 500, 1)]),
		).toEqual([["Messages", "100", "500 /mo"]]);
		expect(
			lines([itemChange("deleted", 100, 1), itemChange("created", 100, 2)]),
		).toEqual([["Messages", "$1.00", "$2.00 /unit"]]);
	});
});

describe("subscriptionReviewSection", () => {
	test("phases run to the next phase, the end date, or forever", () => {
		const phases = [
			phase({ starts_at: NOW, starts_now: true, processor_items: [item({})] }),
			phase({ starts_at: NOW + 30 * DAY_MS, processor_items: [item({})] }),
		];
		const ranges = (endsAt?: number) =>
			subscriptionReviewSection({
				preview: { phases, processor_changes: [] },
				currentEpochMs: NOW,
				endsAt,
			}).phases.map((reviewPhase) => [
				text(reviewPhase.range),
				reviewPhase.badge,
			]);

		expect(ranges()).toEqual([
			["2026-10-14 – 2026-11-13", "active"],
			["2026-11-13 – Forever", "scheduled"],
		]);
		expect(ranges(NOW + 90 * DAY_MS)[1]).toEqual([
			"2026-11-13 – 2027-01-12",
			"scheduled",
		]);
	});

	test("a phase ending the subscription shows one canceled row", () => {
		const section = subscriptionReviewSection({
			preview: {
				phases: [
					phase({ starts_now: true, processor_items: [item({})] }),
					phase({
						starts_at: NOW + 30 * DAY_MS,
						ends_subscription: true,
						processor_items: [item({})],
					}),
				],
				processor_changes: [],
			},
			currentEpochMs: NOW,
		});

		expect(section.phases[1].badge).toBe("canceled");
		expect(section.phases[1].rows.map((row) => row.title)).toEqual([
			"Subscription canceled",
		]);
		expect(text(section.summary)).toBe("1 item now · Canceled on 2026-11-13");
	});

	test("each Stripe id is listed once", () => {
		const section = subscriptionReviewSection({
			preview: {
				phases: [
					phase({
						processor_items: [item({}), item({ display_name: "Pro again" })],
					}),
				],
				processor_changes: [
					{ type: "subscription", id: "sub_1", action: "updated" },
					{ type: "subscription", id: "sub_1", action: "updated" },
				],
			},
			currentEpochMs: NOW,
		});

		expect(section.stripe_ids?.map(({ id }) => id)).toEqual([
			"sub_1",
			"price_pro",
		]);
	});
});

describe("balancesReviewSection", () => {
	test("a reset balance shows its new grant, usage and next reset", () => {
		const change: SetPlansPreviewBalanceChange = {
			feature_id: "messages",
			entity_id: null,
			behavior: "reset",
			balance: {
				granted: 500,
				remaining: 500,
				usage: 0,
				unlimited: false,
				next_reset_at: NOW + 30 * DAY_MS,
				overage_allowed: false,
			},
			previous_attributes: { granted: 100, usage: 40, next_reset_at: NOW },
		} as SetPlansPreviewBalanceChange;
		const [row] = balancesReviewSection({
			preview: { phases: [phase({ balance_changes: [change] })] },
			features: [{ id: "messages", name: "Messages" }] as never,
		}).phases[0].rows;

		expect([row.title, text(row.description), row.value]).toEqual([
			"Messages",
			"100 → 500 granted · 0 used · resets 2026-11-13",
			{ amount: "500", suffix: "of 500 left" },
		]);
	});
});
