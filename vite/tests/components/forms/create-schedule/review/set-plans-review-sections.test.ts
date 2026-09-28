import { expect, test } from "bun:test";
import type {
	Feature,
	ProductV2,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { balanceChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/balanceChangesToReviewSection";
import { planChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/planChangesToReviewSection";
import { processorItemsToReviewSection } from "@/components/forms/create-schedule/utils/review/processorItemsToReviewSection";
import type { ReviewPlan } from "@/components/forms/create-schedule/utils/review/types/reviewChange";
import { monthlyPrice, processorItem } from "./reviewFixtures";

const NOW = Date.UTC(2026, 8, 25);
const NOV_1 = Date.UTC(2026, 10, 1);

const products = [
	{ id: "pro", name: "Pro", is_add_on: false },
	{ id: "premium", name: "Premium", is_add_on: false },
	{ id: "seats", name: "Seats", is_add_on: true },
] as ProductV2[];

const features = [{ id: "credits", name: "API Credits" }] as Feature[];

const reviewPlan = (
	planId: string,
	overrides: Partial<ReviewPlan> = {},
): ReviewPlan => ({
	planId,
	entityId: null,
	product: products.find((product) => product.id === planId),
	...overrides,
});

const reviewPlans = (planIds: string[]) =>
	planIds.map((planId) => reviewPlan(planId));

const context = {
	products,
	priceFor: (product: ProductV2) => ({
		amount: `$${product.items?.[0]?.price ?? product.id.length}`,
		suffix: "/mo",
	}),
};

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
		declaredPlansByPhase: [
			reviewPlans(["premium", "seats"]),
			reviewPlans(["premium", "seats"]),
		],
		existingPlans: reviewPlans(["pro", "seats"]),
		nowMs: NOW,
		context,
	});

	expect(
		section.phases.map((phase) => [
			phase.label,
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
			"Nov 1, 2026",
			[
				["Seats", undefined, "starts", { amount: "$5", suffix: "/mo" }],
				["Premium", undefined, "kept", { amount: "$7", suffix: "/mo" }],
			],
		],
	]);
	expect(section.summary).toBe("2 now · 1 on Nov 1, 2026");
});

test("balance rows classify reset and carried-over usage", () => {
	const section = balanceChangesToReviewSection({
		features,
		nowMs: NOW,
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
			"Nov 1, 2026",
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

test("Stripe rows list the end state per phase, named by plan", () => {
	const seats = processorItem({
		price_id: "price_seats",
		feature_id: "seats",
		feature_name: "Seats",
		quantity: 4,
		price: monthlyPrice(10),
		amount: 40,
	});

	const section = processorItemsToReviewSection({
		nowMs: NOW,
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
						processorItem(),
						processorItem({
							price_id: "price_legacy",
							plan_id: null,
							display_name: "Legacy Support",
							managed_by_autumn: false,
							price: null,
							amount: null,
						}),
					],
				}),
				phase(NOV_1, { processor_items: [processorItem(), seats] }),
			],
		}),
	});

	expect(
		section.phases.map((phase) => [
			phase.label,
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
			[
				["Premium", "Base price", undefined, { amount: "$50", suffix: "/mo" }],
				["Legacy Support", undefined, "unmanaged", undefined],
			],
		],
		[
			"Nov 1, 2026",
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
	expect(section.summary).toBe("2 items now · 2 on Nov 1, 2026");
	expect(section.stripeIds.map((stripeId) => stripeId.id)).toEqual([
		"sub_1",
		"price_premium",
		"price_legacy",
		"price_seats",
	]);
});

const entityChange = (planId: string, action: string, entityId: string) =>
	({
		...subscriptionChange(planId, action),
		entity_id: entityId,
	}) as SetPlansPreviewPhase["plan_changes"][number];

const planRows = (section: ReturnType<typeof planChangesToReviewSection>) =>
	section.phases.flatMap((phase) =>
		phase.rows.map((row) => [
			row.title,
			row.description,
			row.status,
			row.value,
		]),
	);

test("a credit shared by one plan ending on several entities isn't repeated per row", () => {
	const section = planChangesToReviewSection({
		preview: preview({
			line_items: [
				{ plan_id: "pro", total: -10 },
				{ plan_id: "pro", total: -10 },
			] as SetPlansPreviewResponse["line_items"],
			phases: [
				phase(NOW, {
					plan_changes: [
						entityChange("pro", "expired", "ent_a"),
						entityChange("pro", "expired", "ent_b"),
					],
				}),
			],
		}),
		declaredPlansByPhase: [[]],
		existingPlans: [],
		nowMs: NOW,
		context,
	});

	expect(planRows(section)).toEqual([
		[
			"Pro",
			"Unused time credited · -$20.00 across 2 entities · Entity ent_a",
			"ends",
			undefined,
		],
		[
			"Pro",
			"Unused time credited · -$20.00 across 2 entities · Entity ent_b",
			"ends",
			undefined,
		],
	]);
});

test("an ending plan's credit ignores charges for the same plan starting on another entity", () => {
	const section = planChangesToReviewSection({
		preview: preview({
			line_items: [
				{ plan_id: "pro", total: -10 },
				{ plan_id: "pro", total: 20 },
			] as SetPlansPreviewResponse["line_items"],
			phases: [
				phase(NOW, {
					plan_changes: [
						entityChange("pro", "expired", "ent_a"),
						entityChange("pro", "activated", "ent_b"),
					],
				}),
			],
		}),
		declaredPlansByPhase: [[reviewPlan("pro", { entityId: "ent_b" })]],
		existingPlans: [reviewPlan("pro", { entityId: "ent_a" })],
		nowMs: NOW,
		context,
	});

	expect(planRows(section)).toEqual([
		[
			"Pro",
			"Unused time credited · Entity ent_a",
			"ends",
			{ amount: "-$10.00", suffix: "credit" },
		],
		["Pro", "Entity ent_b", "starts", { amount: "$3", suffix: "/mo" }],
	]);
});

const customProduct = (planId: string, price: number) =>
	({
		...products.find((product) => product.id === planId),
		items: [{ price }],
	}) as ProductV2;

test("starting and kept plans show their own custom price, not the catalog's", () => {
	const section = planChangesToReviewSection({
		preview: preview({
			phases: [
				phase(NOW, {
					plan_changes: [subscriptionChange("premium", "activated")],
				}),
			],
		}),
		declaredPlansByPhase: [
			[
				reviewPlan("premium", { product: customProduct("premium", 99) }),
				reviewPlan("seats"),
			],
		],
		existingPlans: [
			reviewPlan("seats", { product: customProduct("seats", 42) }),
		],
		nowMs: NOW,
		context,
	});

	expect(planRows(section)).toEqual([
		["Premium", undefined, "starts", { amount: "$99", suffix: "/mo" }],
		["Seats", undefined, "kept", { amount: "$42", suffix: "/mo" }],
	]);
});

test("a plan declared for several entities keeps a row per entity", () => {
	const section = planChangesToReviewSection({
		preview: preview({ phases: [phase(NOW, {})] }),
		declaredPlansByPhase: [
			[
				reviewPlan("pro", { entityId: "ent_a" }),
				reviewPlan("pro", { entityId: "ent_b" }),
			],
		],
		existingPlans: [
			reviewPlan("pro", { entityId: "ent_a" }),
			reviewPlan("pro", { entityId: "ent_b" }),
		],
		nowMs: NOW,
		context,
	});

	expect(section.phases[0]?.rows.map((row) => [row.key, row.status])).toEqual([
		["plan-0-pro-ent_a-kept-0", "kept"],
		["plan-0-pro-ent_b-kept-1", "kept"],
	]);
});

test("a backdated first phase is labelled with its date, not Now", () => {
	const SEP_1 = Date.UTC(2026, 8, 1);
	const section = planChangesToReviewSection({
		preview: preview({
			phases: [
				phase(SEP_1, {
					plan_changes: [subscriptionChange("premium", "activated")],
				}),
			],
		}),
		declaredPlansByPhase: [reviewPlans(["premium"])],
		existingPlans: [],
		nowMs: NOW,
		context,
	});

	expect(section.phases[0]?.label).toBe("Sep 1, 2026");
	expect(section.summary).toBe("1 on Sep 1, 2026");
});

const unlimitedBalanceChange = ({
	unlimitedBefore,
}: {
	unlimitedBefore: boolean;
}) => ({
	feature_id: "credits",
	balance: {
		granted: 0,
		remaining: 0,
		usage: 0,
		unlimited: !unlimitedBefore,
		next_reset_at: null,
	},
	previous_attributes: { unlimited: unlimitedBefore },
});

test("granting or removing unlimited access reads as added or removed", () => {
	const section = balanceChangesToReviewSection({
		features,
		nowMs: NOW,
		phases: [
			phase(NOW, {
				balance_changes: [unlimitedBalanceChange({ unlimitedBefore: false })],
			}),
			phase(NOV_1, {
				balance_changes: [unlimitedBalanceChange({ unlimitedBefore: true })],
			}),
		],
	});

	expect(
		section.phases.map((phase) => phase.rows.map((row) => row.status)),
	).toEqual([["added"], ["removed"]]);
	expect(section.summary).toBe("1 new · 1 removed");
});

test("a canceled subscription shows as ending, not as zero items", () => {
	const section = processorItemsToReviewSection({
		nowMs: NOW,
		preview: preview({
			processor_changes: [
				{
					type: "subscription",
					processor: "stripe",
					id: "sub_1",
					action: "canceled",
				},
			],
			phases: [phase(NOW, {})],
		}),
	});

	expect(
		section.phases.map((phase) =>
			phase.rows.map((row) => [row.title, row.description, row.status]),
		),
	).toEqual([[["Subscription", "No items left to bill", "ends"]]]);
	expect(section.summary).toBe("Canceled");
});

test("a schedule that ends into no items shows the subscription ending on that date", () => {
	const premium = processorItem();
	const section = processorItemsToReviewSection({
		nowMs: NOW,
		preview: preview({
			phases: [phase(NOW, { processor_items: [premium] }), phase(NOV_1, {})],
		}),
	});

	expect(
		section.phases.map((phase) => phase.rows.map((row) => row.status)),
	).toEqual([[undefined], ["ends"]]);
	expect(section.summary).toBe("1 item now · Canceled on Nov 1, 2026");
});
