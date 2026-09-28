import { expect, test } from "bun:test";
import type {
	Feature,
	ProcessorItem,
	ProcessorItemPrice,
	ProductV2,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { balanceChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/balanceChangesToReviewSection";
import { planChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/planChangesToReviewSection";
import { processorItemsToReviewSection } from "@/components/forms/create-schedule/utils/review/processorItemsToReviewSection";

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
	processor_items: [],
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
		context: {
			products,
			priceLabelFor: (product) => `$${product.id.length}/mo`,
			phaseTotalFor: (planIds) => `${planIds.length} plans`,
		},
	});

	expect(
		section.phases.map((phase) => [
			phase.label,
			phase.total,
			phase.rows.map((row) => [
				row.title,
				row.description,
				row.status,
				row.value,
			]),
		]),
	).toEqual([
		[
			"Now",
			"2 plans",
			[
				["Premium", undefined, "starts", { amount: "$7", suffix: "/mo" }],
				[
					"Pro",
					"Unused time credited",
					"ends",
					{ amount: "-$13.33", suffix: "credit" },
				],
				["Seats", undefined, "kept", { amount: "$5", suffix: "/mo" }],
			],
		],
		[
			"Nov 1",
			"2 plans",
			[
				["Seats", undefined, "starts", { amount: "$5", suffix: "/mo" }],
				["Premium", undefined, "kept", { amount: "$7", suffix: "/mo" }],
			],
		],
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
		section.phases.map((phase) => [
			phase.label,
			phase.rows.map((row) => [row.description, row.status, row.value]),
		]),
	).toEqual([
		[
			"Now",
			[
				[
					"100 → 500 granted · 240 used",
					"carried",
					{ amount: "260", suffix: "of 500 left" },
				],
			],
		],
		[
			"Nov 1",
			[
				[
					"500 → 100 granted · 0 used",
					"reset",
					{ amount: "100", suffix: "of 100 left" },
				],
			],
		],
	]);
	expect(section.summary).toBe("1 reset · 1 carried over");
});

const monthly = (unitAmount: number): ProcessorItemPrice => ({
	currency: "usd",
	unit_amount: unitAmount,
	interval: "month",
	interval_count: 1,
	usage_type: "licensed",
	tiers_mode: null,
	tiers: null,
	units_per_quantity: null,
});

test("Stripe rows list the end state per phase, named by plan", () => {
	const item = (overrides: Partial<ProcessorItem>): ProcessorItem => ({
		item_id: null,
		price_id: "price_premium",
		plan_id: "premium",
		feature_id: null,
		display_name: "Premium",
		feature_name: null,
		quantity: 1,
		price: monthly(50),
		amount: 50,
		creates_price: false,
		managed_by_autumn: true,
		...overrides,
	});
	const seats = item({
		price_id: "price_seats",
		feature_id: "seats",
		feature_name: "Seats",
		quantity: 4,
		price: monthly(10),
		amount: 40,
	});

	const section = processorItemsToReviewSection({
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
					processor_items: [
						item({}),
						item({
							price_id: "price_legacy",
							plan_id: null,
							display_name: "Legacy Support",
							managed_by_autumn: false,
							price: null,
							amount: null,
						}),
					],
				}),
				phase(NOV_1, { processor_items: [item({}), seats] }),
			],
		}),
	});

	expect(
		section.phases.map((phase) => [
			phase.label,
			phase.total,
			phase.rows.map((row) => [
				row.title,
				row.description,
				row.status,
				row.value,
			]),
		]),
	).toEqual([
		[
			"Now",
			"$50/mo",
			[
				["Premium", "Base price", undefined, { amount: "$50", suffix: "/mo" }],
				["Legacy Support", undefined, "unmanaged", undefined],
			],
		],
		[
			"Nov 1",
			"$90/mo",
			[
				["Premium", "Base price", undefined, { amount: "$50", suffix: "/mo" }],
				[
					"Premium",
					"Seats · 4 × $10",
					undefined,
					{ amount: "$40", suffix: "/mo" },
				],
			],
		],
	]);
	expect(section.summary).toBe("2 items now · 2 on Nov 1");
	expect(section.stripeIds.map((stripeId) => stripeId.id)).toEqual([
		"sub_1",
		"price_premium",
		"price_legacy",
		"price_seats",
	]);
});
