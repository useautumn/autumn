import { expect, test } from "bun:test";
import type {
	Feature,
	ProductV2,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { balanceChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/balanceChangesToReviewSection";
import { planChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/planChangesToReviewSection";
import { processorChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/processorChangesToReviewSection";

const NOW = Date.UTC(2026, 8, 25);
const NOV_1 = Date.UTC(2026, 10, 1);

const products = [
	{ id: "pro", name: "Pro", is_add_on: false },
	{ id: "premium", name: "Premium", is_add_on: false },
	{ id: "seats", name: "Seats", is_add_on: true },
] as ProductV2[];

const features = [{ id: "credits", name: "API Credits" }] as Feature[];

const subscriptionChange = (planId: string, action: string) =>
	({
		action,
		subscription: { plan_id: planId },
		previous_attributes: null,
		item_changes: [],
	}) as unknown as SetPlansPreviewPhase["plan_changes"][number];

const phase = (
	startsAt: number,
	overrides: Partial<SetPlansPreviewPhase>,
): SetPlansPreviewPhase => ({
	starts_at: startsAt,
	plan_changes: [],
	balance_changes: [],
	processor_item_changes: [],
	...overrides,
});

const preview = (
	overrides: Partial<SetPlansPreviewResponse>,
): SetPlansPreviewResponse =>
	({
		currency: "usd",
		line_items: [],
		phases: [],
		processor_changes: [],
		warnings: [],
		...overrides,
	}) as unknown as SetPlansPreviewResponse;

test("plan rows mark starting, ending and kept plans per phase", () => {
	const section = planChangesToReviewSection({
		preview: preview({
			line_items: [
				{ plan_id: "pro", total: -13.33 },
			] as SetPlansPreviewResponse["line_items"],
			phases: [
				phase(NOW, {
					plan_changes: [
						subscriptionChange("premium", "activated"),
						subscriptionChange("pro", "expired"),
					],
				}),
				phase(NOV_1, {
					plan_changes: [subscriptionChange("seats", "scheduled")],
				}),
			],
		}),
		declaredPlanIdsByPhase: [
			["premium", "seats"],
			["premium", "seats"],
		],
		existingPlanIds: ["pro", "seats"],
		context: { products, priceLabelFor: (product) => `${product.id}-price` },
	});

	expect(
		section.rows.map((row) => [row.title, row.label, row.tone, row.value]),
	).toEqual([
		["Premium", "Starts now", "new", "premium-price"],
		["Pro", "Ends now", "ending", "-$13.33"],
		["Seats", "Kept", "kept", "seats-price"],
		["Seats", "Starts Nov 1", "new", "seats-price"],
		["Premium", "Kept", "kept", "premium-price"],
	]);
	expect(section.summary).toBe("2 now · 1 on Nov 1");
});

test("balance rows classify reset and carried-over usage", () => {
	const section = balanceChangesToReviewSection({
		features,
		phases: [
			phase(NOW, {
				balance_changes: [
					{
						feature_id: "credits",
						balance: {
							granted: 500,
							remaining: 260,
							usage: 240,
							unlimited: false,
							next_reset_at: null,
						},
						previous_attributes: { granted: 100 },
					},
				],
			}),
			phase(NOV_1, {
				balance_changes: [
					{
						feature_id: "credits",
						balance: {
							granted: 100,
							remaining: 100,
							usage: 0,
							unlimited: false,
							next_reset_at: null,
						},
						previous_attributes: { granted: 500, usage: 240 },
					},
				],
			}),
		],
	});

	expect(
		section.rows.map((row) => [row.title, row.label, row.detail, row.value]),
	).toEqual([
		["API Credits", "Carried over", "Granted 100 → 500", "260 left"],
		[
			"API Credits",
			"Reset",
			"From Nov 1 · Granted 500 → 100 · Usage 240 → 0",
			"100 left",
		],
	]);
	expect(section.summary).toBe("1 reset · 1 carried over");
});

test("processor rows list subscription actions and item changes", () => {
	const section = processorChangesToReviewSection({
		preview: preview({
			processor_changes: [
				{
					type: "subscription",
					processor: "stripe",
					id: "sub_1",
					action: "updated",
				},
			],
			phases: [
				phase(NOW, {
					processor_item_changes: [
						{
							action: "deleted",
							item_id: "si_1",
							price_id: "price_legacy",
							plan_id: null,
							feature_id: null,
							display_name: "Legacy Support",
							quantity: 1,
							previous_attributes: null,
							creates_price: false,
							managed_by_autumn: false,
						},
						{
							action: "updated",
							item_id: "si_2",
							price_id: "price_seats",
							plan_id: "seats",
							feature_id: null,
							display_name: "Seats",
							quantity: 4,
							previous_attributes: { quantity: 2 },
							creates_price: false,
							managed_by_autumn: true,
						},
					],
				}),
			],
		}),
	});

	expect(
		section.rows.map((row) => [row.title, row.label, row.detail, row.value]),
	).toEqual([
		["Subscription", "Updated", undefined, undefined],
		["Legacy Support", "Removed", "Not in Autumn", "× 1"],
		["Seats", "Updated", undefined, "× 2 → 4"],
	]);
	expect(section.summary).toBe("1 removed · 1 updated");
});
