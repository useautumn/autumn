import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type Feature,
	type FullCusProduct,
	ms,
	msToSeconds,
	type Organization,
	PriceType,
	type ProcessorItem,
	type ProcessorItemPrice,
} from "@autumn/shared";
import type Stripe from "stripe";
import { buildAutumnStripePriceIndex } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/buildAutumnStripePriceIndex";
import { checkoutSessionActionToProcessorItems } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/checkoutSessionActionToProcessorItems";
import {
	phasesEndingSubscription,
	scheduleActionToProcessorItems,
} from "@/internal/billing/v2/actions/setPlans/preview/processorItems/scheduleActionToProcessorItems";
import { subscriptionActionToProcessorItems } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/subscriptionActionToProcessorItems";
import type { ProcessorItemContext } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/types/processorItemContext";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";

const NOW = 1_710_000_000_000;
const PHASE_TWO = NOW + ms.days(30);

const withPrices = ({
	planId,
	prices,
}: {
	planId: string;
	prices: {
		id: string;
		stripePriceId: string;
		featureId?: string;
		amount: number;
	}[];
}): FullCusProduct => ({
	...makeFullCusProduct({ planId }),
	customer_prices: prices.map((price) => ({
		id: `cus_${price.id}`,
		price: {
			id: price.id,
			config: price.featureId
				? {
						type: PriceType.Usage,
						bill_when: BillWhen.InAdvance,
						interval: BillingInterval.Month,
						usage_tiers: [{ to: "inf", amount: price.amount }],
						stripe_price_id: price.stripePriceId,
						feature_id: price.featureId,
					}
				: {
						type: PriceType.Fixed,
						amount: price.amount,
						interval: BillingInterval.Month,
						stripe_price_id: price.stripePriceId,
					},
		},
	})) as unknown as FullCusProduct["customer_prices"],
});

const priceIndex = buildAutumnStripePriceIndex({
	customerProducts: [
		withPrices({
			planId: "pro",
			prices: [
				{ id: "pro_base", stripePriceId: "price_pro_base", amount: 20 },
				{
					id: "pro_seats",
					stripePriceId: "price_pro_seats",
					featureId: "seats",
					amount: 10,
				},
			],
		}),
		withPrices({
			planId: "premium",
			prices: [
				{ id: "premium_base", stripePriceId: "price_PREVIEW_abc", amount: 50 },
			],
		}),
	],
	features: [{ id: "seats", name: "Seats" }] as Feature[],
});

const liveSubscription = {
	id: "sub_live",
	items: {
		data: [
			{
				id: "si_base",
				price: {
					id: "price_pro_base",
					nickname: null,
					currency: "usd",
					unit_amount: 2000,
					billing_scheme: "per_unit",
					recurring: {
						interval: "month",
						interval_count: 1,
						usage_type: "licensed",
					},
				},
				quantity: 1,
				metadata: { autumn_price_id: "pro_base" },
			},
			{
				id: "si_seats",
				price: {
					id: "price_pro_seats",
					nickname: null,
					currency: "usd",
					unit_amount: 1000,
					billing_scheme: "per_unit",
					recurring: {
						interval: "month",
						interval_count: 1,
						usage_type: "licensed",
					},
				},
				quantity: 3,
				metadata: { autumn_price_id: "pro_seats" },
			},
			{
				id: "si_addon",
				price: {
					id: "price_external",
					nickname: "Support add-on",
					currency: "usd",
					unit_amount: 500,
					billing_scheme: "per_unit",
					recurring: {
						interval: "month",
						interval_count: 1,
						usage_type: "licensed",
					},
				},
				quantity: 1,
				metadata: {},
			},
		],
	},
} as unknown as Stripe.Subscription;

const context: ProcessorItemContext = {
	priceIndex,
	stripePrices: new Map(
		liveSubscription.items.data.map((item) => [item.price.id, item.price]),
	),
	currency: "usd",
	org: { default_currency: "usd" } as Organization,
};

const monthlyPrice = (unitAmount: number): ProcessorItemPrice => ({
	currency: "usd",
	unit_amount: unitAmount,
	interval: "month",
	interval_count: 1,
	usage_type: "licensed",
	tiers_mode: null,
	tiers: null,
	units_per_quantity: null,
});

const summarize = (items: ProcessorItem[]) =>
	items.map((item) => [item.display_name, item.feature_name, item.quantity]);

describe("subscriptionActionToProcessorItems", () => {
	test("an update keeps unmentioned live items and applies the rest", () => {
		const items = subscriptionActionToProcessorItems({
			subscriptionAction: {
				type: "update",
				stripeSubscriptionId: "sub_live",
				params: {
					items: [
						{ id: "si_base", deleted: true },
						{ id: "si_seats", quantity: 5 },
						{
							price: "price_PREVIEW_abc",
							quantity: 1,
							metadata: { autumn_price_id: "premium_base" },
						},
					],
				},
			},
			stripeSubscription: liveSubscription,
			context,
		});

		expect(items).toEqual([
			{
				price_id: "price_pro_seats",
				plan_id: "pro",
				feature_id: "seats",
				display_name: "pro",
				feature_name: "Seats",
				quantity: 5,
				price: monthlyPrice(10),
				amount: 50,
				creates_price: false,
				managed_by_autumn: true,
			},
			{
				price_id: "price_external",
				plan_id: null,
				feature_id: null,
				display_name: "Support add-on",
				feature_name: null,
				quantity: 1,
				price: monthlyPrice(5),
				amount: 5,
				creates_price: false,
				managed_by_autumn: false,
			},
			{
				price_id: null,
				plan_id: "premium",
				feature_id: null,
				display_name: "premium",
				feature_name: null,
				quantity: 1,
				price: monthlyPrice(50),
				amount: 50,
				creates_price: true,
				managed_by_autumn: true,
			},
		]);
	});

	test("no action leaves the live items as they are", () => {
		expect(
			summarize(
				subscriptionActionToProcessorItems({
					subscriptionAction: { type: "none" },
					stripeSubscription: liveSubscription,
					context,
				}),
			),
		).toEqual([
			["pro", null, 1],
			["pro", "Seats", 3],
			["Support add-on", null, 1],
		]);
	});

	test("canceling immediately leaves nothing in Stripe", () => {
		expect(
			subscriptionActionToProcessorItems({
				subscriptionAction: {
					type: "cancel_immediately",
					stripeSubscriptionId: "sub_live",
				},
				stripeSubscription: liveSubscription,
				context,
			}),
		).toEqual([]);
	});
});

describe("processor item prices", () => {
	test("inline prices are read from price_data in major units", () => {
		const [item] = checkoutSessionActionToProcessorItems({
			checkoutSessionAction: {
				type: "create",
				params: {
					mode: "subscription",
					line_items: [
						{
							price_data: {
								currency: "usd",
								product: "prod_seats",
								unit_amount: 1500,
								recurring: { interval: "year" },
							},
							quantity: 3,
						},
					],
				},
			},
			context,
		});

		expect([
			item.price?.unit_amount,
			item.price?.interval,
			item.amount,
		]).toEqual([15, "year", 45]);
		expect(item.creates_price).toBe(true);
	});
});

describe("checkoutSessionActionToProcessorItems", () => {
	test("a subscription checkout holds exactly its line items", () => {
		const items = checkoutSessionActionToProcessorItems({
			checkoutSessionAction: {
				type: "create",
				params: {
					mode: "subscription",
					line_items: [{ price: "price_pro_base", quantity: 1 }],
				},
			},
			context,
		});

		expect(items.map((item) => item.plan_id)).toEqual(["pro"]);
	});

	test("one-off line items are invoiced, not held by the subscription", () => {
		const items = checkoutSessionActionToProcessorItems({
			checkoutSessionAction: {
				type: "create",
				params: {
					mode: "subscription",
					line_items: [
						{ price: "price_pro_base", quantity: 1 },
						{
							price_data: {
								currency: "usd",
								product: "prod_setup",
								unit_amount: 5000,
							},
							quantity: 1,
						},
					],
				},
			},
			context,
		});

		expect(items.map((item) => item.plan_id)).toEqual(["pro"]);
	});
});

const PHASE_THREE = PHASE_TWO + ms.days(30);
const phasesAt = (...startsAts: number[]) =>
	startsAts.map((startsAt) => ({ startsAt, customerProductIds: [] }));
const scheduleCreate = (
	phases: Stripe.SubscriptionScheduleUpdateParams.Phase[],
) => ({ type: "create" as const, params: { phases } });

describe("scheduleActionToProcessorItems", () => {
	test("each future phase lists the Stripe phase active at its start", () => {
		const items = scheduleActionToProcessorItems({
			subscriptionScheduleAction: scheduleCreate([
				{
					start_date: msToSeconds(NOW),
					items: [
						{ price: "price_pro_base" },
						{ price: "price_pro_seats", quantity: 3 },
					],
				},
				{
					start_date: msToSeconds(PHASE_TWO),
					items: [
						{ price: "price_PREVIEW_abc" },
						{ price: "price_pro_seats", quantity: 4 },
					],
				},
			]),
			phases: phasesAt(PHASE_TWO),
			context,
		});

		expect(items.map(summarize)).toEqual([
			[
				["premium", null, null],
				["pro", "Seats", 4],
			],
		]);
	});

	test("Stripe phases between Autumn phases resolve to the latest one", () => {
		const midPhase = NOW + ms.days(10);
		const items = scheduleActionToProcessorItems({
			subscriptionScheduleAction: scheduleCreate([
				{ start_date: msToSeconds(NOW), items: [{ price: "price_pro_base" }] },
				{
					start_date: msToSeconds(midPhase),
					items: [{ price: "price_pro_seats", quantity: 2 }],
				},
				{
					start_date: msToSeconds(PHASE_THREE),
					items: [{ price: "price_PREVIEW_abc" }],
				},
			]),
			phases: phasesAt(PHASE_TWO, PHASE_THREE),
			context,
		});

		expect(items.map(summarize)).toEqual([
			[["pro", "Seats", 2]],
			[["premium", null, null]],
		]);
	});

	test("a schedule starting at a later first phase lists its items there", () => {
		const items = scheduleActionToProcessorItems({
			subscriptionScheduleAction: scheduleCreate([
				{
					start_date: msToSeconds(PHASE_TWO),
					items: [{ price: "price_pro_base" }, { price: "price_PREVIEW_abc" }],
				},
			]),
			phases: phasesAt(PHASE_TWO),
			context,
		});

		expect(items.map(summarize)).toEqual([
			[
				["pro", null, null],
				["premium", null, null],
			],
		]);
	});

	test("a phase before the schedule starts holds nothing from it", () => {
		const items = scheduleActionToProcessorItems({
			subscriptionScheduleAction: scheduleCreate([
				{
					start_date: msToSeconds(PHASE_THREE),
					items: [{ price: "price_pro_base" }],
				},
			]),
			phases: phasesAt(PHASE_TWO),
			context,
		});

		expect(items).toEqual([[]]);
	});

	test("a schedule that cancels holds nothing once its last phase ends", () => {
		const items = scheduleActionToProcessorItems({
			subscriptionScheduleAction: {
				type: "create",
				params: {
					end_behavior: "cancel",
					phases: [
						{
							start_date: msToSeconds(NOW),
							end_date: msToSeconds(PHASE_TWO),
							items: [{ price: "price_pro_base" }],
						},
					],
				},
			},
			phases: phasesAt(PHASE_TWO),
			context,
		});

		expect(items).toEqual([[]]);
	});

	test("a schedule that releases keeps its last phase's items", () => {
		const items = scheduleActionToProcessorItems({
			subscriptionScheduleAction: {
				type: "create",
				params: {
					end_behavior: "release",
					phases: [
						{
							start_date: msToSeconds(NOW),
							end_date: msToSeconds(PHASE_TWO),
							items: [{ price: "price_pro_base" }],
						},
					],
				},
			},
			phases: phasesAt(PHASE_TWO),
			context,
		});

		expect(items.map(summarize)).toEqual([[["pro", null, null]]]);
	});
});

describe("phasesEndingSubscription", () => {
	test("canceling the subscription now ends it in the first phase", () => {
		expect(
			phasesEndingSubscription({
				subscriptionAction: {
					type: "cancel_immediately",
					stripeSubscriptionId: "sub_live",
				},
				phases: phasesAt(NOW),
			}),
		).toEqual([true]);
	});

	test("a canceling schedule ends the subscription at the phase it stops at", () => {
		const PHASE_THREE = PHASE_TWO + ms.days(30);
		expect(
			phasesEndingSubscription({
				subscriptionScheduleAction: {
					type: "create",
					params: {
						end_behavior: "cancel",
						phases: [
							{
								start_date: msToSeconds(NOW),
								end_date: msToSeconds(PHASE_TWO),
								items: [{ price: "price_pro_base" }],
							},
						],
					},
				},
				phases: phasesAt(NOW, PHASE_TWO, PHASE_THREE),
			}),
		).toEqual([false, true, false]);
	});

	test("a releasing schedule never ends the subscription", () => {
		expect(
			phasesEndingSubscription({
				subscriptionScheduleAction: {
					type: "create",
					params: {
						end_behavior: "release",
						phases: [
							{
								start_date: msToSeconds(NOW),
								end_date: msToSeconds(PHASE_TWO),
								items: [{ price: "price_pro_base" }],
							},
						],
					},
				},
				phases: phasesAt(NOW, PHASE_TWO),
			}),
		).toEqual([false, false]);
	});
});
