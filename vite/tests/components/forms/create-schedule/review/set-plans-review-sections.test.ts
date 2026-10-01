import { expect, test } from "bun:test";
import type {
	Feature,
	SetPlansPreviewBalanceChange,
	SetPlansPreviewPhase,
	SetPlansPreviewPlan,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { balanceChangesToReviewSection } from "@/components/forms/create-schedule/utils/review/balanceChangesToReviewSection";
import { plansToReviewSection } from "@/components/forms/create-schedule/utils/review/plansToReviewSection";
import { processorItemsToReviewSection } from "@/components/forms/create-schedule/utils/review/processorItemsToReviewSection";
import { monthlyPrice, processorItem } from "./reviewFixtures";

const NOW = Date.UTC(2026, 8, 25);
const NOV_1 = Date.UTC(2026, 10, 1);

const features = [
	{ id: "credits", name: "API Credits" },
	{
		id: "seats",
		name: "Seats",
		type: "metered",
		config: { usage_type: "continuous_use" },
	},
] as Feature[];

const phase = (
	startsAt: number,
	overrides: Partial<SetPlansPreviewPhase> = {},
): SetPlansPreviewPhase => ({
	starts_at: startsAt,
	starts_now: startsAt === NOW,
	ends_subscription: false,
	plans: [],
	plan_changes: [],
	balance_changes: [],
	processor_items: [],
	...overrides,
});

const plan = (
	name: string,
	overrides: Partial<SetPlansPreviewPlan> = {},
): SetPlansPreviewPlan => ({
	plan_id: name.toLowerCase(),
	entity_id: null,
	name,
	status: "starts",
	custom: false,
	ongoing: false,
	expires_at: null,
	trial_ends_at: null,
	credit: null,
	prices: [{ feature_id: null, price: monthlyPrice(name.length) }],
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

const planRows = (section: ReturnType<typeof plansToReviewSection>) =>
	section.phases.map((reviewPhase) => [
		reviewPhase.label,
		reviewPhase.rows.map((row) => [
			row.title,
			row.description,
			row.status,
			row.value,
		]),
	]);

test("plan rows present each phase's plans as the server returns them", () => {
	const section = plansToReviewSection({
		currency: "usd",
		features,
		nowMs: NOW,
		phases: [
			phase(NOW, {
				plans: [
					plan("Premium"),
					plan("Pro", { status: "ends", credit: -13.33 }),
					plan("Seats", { status: "kept" }),
				],
			}),
			phase(NOV_1, {
				plans: [
					plan("Seats", { entity_id: "ent_a", custom: true }),
					plan("Premium", { status: "kept" }),
				],
			}),
		],
	});

	expect(planRows(section)).toEqual([
		[
			"Now",
			[
				["Premium", undefined, "starts", { amount: "$7", suffix: "/mo" }],
				["Pro", "$13.33 credited", "ends", { amount: "$3", suffix: "/mo" }],
				["Seats", undefined, "kept", { amount: "$5", suffix: "/mo" }],
			],
		],
		[
			"Nov 1, 2026",
			[
				["Seats", "Custom", "starts", { amount: "$5", suffix: "/mo" }],
				["Premium", undefined, "kept", { amount: "$7", suffix: "/mo" }],
			],
		],
	]);
	expect(section.summary).toBe("2 now · 1 on Nov 1, 2026");
});

test("an ongoing plan's row is marked ongoing; phase plans are not", () => {
	const section = plansToReviewSection({
		currency: "usd",
		features,
		nowMs: NOW,
		phases: [
			phase(NOW, {
				plans: [
					plan("Pro", { status: "kept" }),
					plan("Growth", { status: "updated", ongoing: true }),
				],
			}),
		],
	});

	expect(
		section.phases[0]?.rows.map((row) => [row.title, row.ongoing]),
	).toEqual([
		["Pro", false],
		["Growth", true],
	]);
});

test("an updated plan that ends later says when", () => {
	const section = plansToReviewSection({
		currency: "usd",
		features,
		nowMs: NOW,
		phases: [
			phase(NOW, {
				plans: [plan("Pro", { status: "updated", expires_at: NOV_1 })],
			}),
		],
	});

	expect(section.phases[0]?.rows[0]?.description).toBe("Ends Nov 1, 2026");
});

test("a removed saved phase sorts in among the others with every plan removed", () => {
	const DEC_1 = Date.UTC(2026, 11, 1);
	const section = plansToReviewSection({
		currency: "usd",
		features,
		nowMs: NOW,
		phases: [
			phase(NOW, {
				plans: [plan("Pro", { status: "kept", expires_at: DEC_1 })],
			}),
			phase(DEC_1, {
				plans: [plan("Growth", { status: "kept" })],
			}),
		],
		removedPhases: [
			{
				starts_at: NOV_1,
				plans: [
					plan("Premium", { status: "ends", expires_at: NOV_1 }),
					plan("Bonus", { status: "ends", expires_at: NOV_1 }),
				],
			},
		],
	});

	expect(
		section.phases.map((reviewPhase) => [
			reviewPhase.label,
			reviewPhase.removed ?? false,
			reviewPhase.rows.map((row) => [row.title, row.status]),
		]),
	).toEqual([
		["Now", false, [["Pro", "kept"]]],
		[
			"Nov 1, 2026",
			true,
			[
				["Premium", "ends"],
				["Bonus", "ends"],
			],
		],
		["Dec 1, 2026", false, [["Growth", "kept"]]],
	]);
	expect(section.summary).toBe("1 phase removed");
});

test("a plan created until a later phase says when it ends", () => {
	const section = plansToReviewSection({
		currency: "usd",
		features,
		nowMs: NOW,
		phases: [phase(NOW, { plans: [plan("SSO", { expires_at: NOV_1 })] })],
	});

	expect(section.phases[0]?.rows[0]?.description).toBe("Ends Nov 1, 2026");
});

test("a plan still on trial shows when the trial ends; a lapsed trial doesn't", () => {
	const OCT_14 = Date.UTC(2026, 9, 14);
	const section = plansToReviewSection({
		currency: "usd",
		features,
		nowMs: NOW,
		phases: [
			phase(NOW, {
				plans: [
					plan("Pro", { status: "kept", trial_ends_at: OCT_14 }),
					plan("Team", { status: "kept", trial_ends_at: Date.UTC(2026, 8, 1) }),
				],
			}),
		],
	});

	expect(section.phases[0]?.rows.map((row) => row.trialEndsAt)).toEqual([
		OCT_14,
		undefined,
	]);
});

test("a first phase the server says is backdated is labelled with its date", () => {
	const SEP_1 = Date.UTC(2026, 8, 1);
	const section = plansToReviewSection({
		currency: "usd",
		features,
		nowMs: NOW,
		phases: [phase(SEP_1, { plans: [plan("Premium")] })],
	});

	expect(section.phases[0]?.label).toBe("Sep 1, 2026");
	expect(section.summary).toBe("1 on Sep 1, 2026");
});

const balanceChange = (
	overrides: Partial<SetPlansPreviewBalanceChange>,
): SetPlansPreviewBalanceChange => ({
	feature_id: "credits",
	entity_id: null,
	balance: {
		granted: 500,
		remaining: 260,
		usage: 240,
		unlimited: false,
		next_reset_at: null,
		overage_allowed: false,
	},
	previous_attributes: { granted: 100 },
	behavior: "carried",
	...overrides,
});

test("balance rows show the server's behaviour with labelled numbers", () => {
	const section = balanceChangesToReviewSection({
		features,
		phases: [
			phase(NOW, { balance_changes: [balanceChange({})] }),
			phase(NOV_1, {
				balance_changes: [
					balanceChange({
						balance: {
							granted: 100,
							remaining: 100,
							usage: 0,
							unlimited: false,
							next_reset_at: null,
							overage_allowed: false,
						},
						previous_attributes: { granted: 500, usage: 240 },
						behavior: "reset",
					}),
				],
			}),
		],
	});

	expect(
		section.phases.map((reviewPhase) => [
			reviewPhase.label,
			reviewPhase.rows.map((row) => [row.description, row.status, row.value]),
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

test("balance rows carry their entity and every change is counted", () => {
	const section = balanceChangesToReviewSection({
		features,
		phases: [
			phase(NOW, {
				balance_changes: [
					balanceChange({ entity_id: "ent_a" }),
					balanceChange({ entity_id: "ent_b" }),
				],
			}),
			phase(NOV_1, {
				balance_changes: [balanceChange({ behavior: "updated" })],
			}),
		],
	});

	expect(
		section.phases.map((reviewPhase) =>
			reviewPhase.rows.map((row) => [row.key, row.entityId, row.description]),
		),
	).toEqual([
		[
			["balance-0-ent_a-credits", "ent_a", "100 → 500 granted · 240 used"],
			["balance-0-ent_b-credits", "ent_b", "100 → 500 granted · 240 used"],
		],
		[["balance-1-customer-credits", null, "100 → 500 granted · 240 used"]],
	]);
	expect(section.summary).toBe("2 carried over · 1 updated");
});

test("a pay-per-use balance reads as usage-based, not as nothing granted", () => {
	const section = balanceChangesToReviewSection({
		features,
		phases: [
			phase(NOW, {
				balance_changes: [
					balanceChange({
						balance: {
							granted: 0,
							remaining: 0,
							usage: 0,
							unlimited: false,
							next_reset_at: null,
							overage_allowed: true,
						},
						previous_attributes: { overage_allowed: false },
						behavior: "added",
					}),
				],
			}),
		],
	});

	expect(section.phases[0]?.rows[0]?.value).toEqual({
		amount: "Usage-based",
		isBasis: true,
	});
});

const pricingRows = (
	section: ReturnType<typeof processorItemsToReviewSection>,
) =>
	section.phases.map((reviewPhase) => ({
		range: reviewPhase.range,
		badge: reviewPhase.badge,
		rows: reviewPhase.rows.map((row) => [
			row.title,
			row.description,
			row.quantity,
			row.value?.amount,
		]),
	}));

test("Stripe phases read as pricing tables: product, price line, qty and total", () => {
	const seats = processorItem({
		price_id: "price_seats",
		feature_id: "seats",
		feature_name: "Seats",
		quantity: 4,
		price: monthlyPrice(10),
		amount: 40,
	});
	const credits = processorItem({
		price_id: "price_credits",
		feature_id: "credits",
		feature_name: "AI Credits",
		quantity: null,
		price: { ...monthlyPrice(0.01), usage_type: "metered" },
		amount: null,
	});

	const section = processorItemsToReviewSection({
		nowMs: NOW,
		preview: preview({
			processor_changes: [
				{ type: "subscription", id: "sub_1", action: "updated" },
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
				phase(NOV_1, { processor_items: [processorItem(), seats, credits] }),
			],
		}),
	});

	expect(pricingRows(section)).toEqual([
		{
			range: "Sep 25, 2026 – Nov 1, 2026",
			badge: "active",
			rows: [
				["Premium", "US$50.00 / month", "1", "US$50.00 / month"],
				["Legacy Support", "Not managed by Autumn", "1", undefined],
			],
		},
		{
			range: "Nov 1, 2026 – Forever",
			badge: "scheduled",
			rows: [
				["Premium", "US$50.00 / month", "1", "US$50.00 / month"],
				["Seats", "US$10.00 / month", "4", "US$40.00 / month"],
				["AI Credits", "US$0.01 per unit / month", "—", "Varies with usage"],
			],
		},
	]);
	expect(section.summary).toBe("2 items now · 3 items on Nov 1, 2026");
	expect(section.stripeIds?.map((stripeId) => stripeId.id)).toEqual([
		"sub_1",
		"price_premium",
		"price_legacy",
		"price_seats",
		"price_credits",
	]);
});

test("a phase the server says ends the subscription shows it ending", () => {
	const section = processorItemsToReviewSection({
		nowMs: NOW,
		preview: preview({
			phases: [
				phase(NOW, { processor_items: [processorItem()] }),
				phase(NOV_1, { ends_subscription: true }),
			],
		}),
	});

	expect(
		section.phases.map((reviewPhase) => [
			reviewPhase.range,
			reviewPhase.badge,
			reviewPhase.rows.map((row) => row.title),
		]),
	).toEqual([
		["Sep 25, 2026 – Nov 1, 2026", "active", ["Premium"]],
		["Nov 1, 2026", "canceled", ["Subscription canceled"]],
	]);
	expect(section.summary).toBe("1 item now · Canceled on Nov 1, 2026");
});

test("canceling now reads as Canceled", () => {
	const section = processorItemsToReviewSection({
		nowMs: NOW,
		preview: preview({ phases: [phase(NOW, { ends_subscription: true })] }),
	});

	expect(section.summary).toBe("Canceled");
});

test("a phase that began before now reads as active, not scheduled", () => {
	const SEP_20 = Date.UTC(2026, 8, 20);
	const section = processorItemsToReviewSection({
		nowMs: NOW,
		preview: preview({
			phases: [
				phase(SEP_20, { processor_items: [processorItem()] }),
				phase(NOV_1, { processor_items: [processorItem()] }),
			],
		}),
	});

	expect(section.phases.map((reviewPhase) => reviewPhase.badge)).toEqual([
		"active",
		"scheduled",
	]);
});
