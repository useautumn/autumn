import { describe, expect, test } from "bun:test";
import type {
	Feature,
	FullCusProduct,
	ProcessorItemChange,
} from "@autumn/shared";
import type Stripe from "stripe";
import { buildAutumnStripePriceIndex } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/buildAutumnStripePriceIndex";
import { checkoutSessionActionToProcessorItemChanges } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/checkoutSessionActionToProcessorItemChanges";
import { scheduleActionToProcessorItemChanges } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/scheduleActionToProcessorItemChanges";
import { subscriptionActionToProcessorItemChanges } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/subscriptionActionToProcessorItemChanges";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";

const NOW = 1_710_000_000_000;
const PHASE_TWO = NOW + 30 * 24 * 60 * 60 * 1000;

const withPrices = ({
	planId,
	prices,
}: {
	planId: string;
	prices: { id: string; stripePriceId: string; featureId?: string }[];
}): FullCusProduct => ({
	...makeFullCusProduct({ planId }),
	customer_prices: prices.map((price) => ({
		id: `cus_${price.id}`,
		price: {
			id: price.id,
			config: {
				stripe_price_id: price.stripePriceId,
				feature_id: price.featureId,
			},
		},
	})) as unknown as FullCusProduct["customer_prices"],
});

const priceIndex = buildAutumnStripePriceIndex({
	customerProducts: [
		withPrices({
			planId: "pro",
			prices: [
				{ id: "pro_base", stripePriceId: "price_pro_base" },
				{
					id: "pro_seats",
					stripePriceId: "price_pro_seats",
					featureId: "seats",
				},
			],
		}),
		withPrices({
			planId: "premium",
			prices: [{ id: "premium_base", stripePriceId: "price_PREVIEW_abc" }],
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
				price: { id: "price_pro_base", nickname: null },
				quantity: 1,
				metadata: { autumn_price_id: "pro_base" },
			},
			{
				id: "si_seats",
				price: { id: "price_pro_seats", nickname: null },
				quantity: 3,
				metadata: { autumn_price_id: "pro_seats" },
			},
			{
				id: "si_addon",
				price: { id: "price_external", nickname: "Support add-on" },
				quantity: 1,
				metadata: {},
			},
		],
	},
} as unknown as Stripe.Subscription;

describe("subscriptionActionToProcessorItemChanges", () => {
	test("maps created, updated and deleted items back to Autumn", () => {
		const changes = subscriptionActionToProcessorItemChanges({
			subscriptionAction: {
				type: "update",
				stripeSubscriptionId: "sub_live",
				params: {
					items: [
						{ id: "si_base", deleted: true },
						{ id: "si_seats", quantity: 5 },
						{ id: "si_addon", deleted: true },
						{
							price: "price_PREVIEW_abc",
							quantity: 1,
							metadata: { autumn_price_id: "premium_base" },
						},
					],
				},
			},
			stripeSubscription: liveSubscription,
			priceIndex,
		});

		expect(changes).toEqual([
			{
				action: "deleted",
				item_id: "si_base",
				price_id: "price_pro_base",
				plan_id: "pro",
				feature_id: null,
				display_name: "pro",
				quantity: 1,
				previous_attributes: null,
				creates_price: false,
				managed_by_autumn: true,
			},
			{
				action: "updated",
				item_id: "si_seats",
				price_id: "price_pro_seats",
				plan_id: "pro",
				feature_id: "seats",
				display_name: "Seats",
				quantity: 5,
				previous_attributes: { quantity: 3 },
				creates_price: false,
				managed_by_autumn: true,
			},
			{
				action: "deleted",
				item_id: "si_addon",
				price_id: "price_external",
				plan_id: null,
				feature_id: null,
				display_name: "Support add-on",
				quantity: 1,
				previous_attributes: null,
				creates_price: false,
				managed_by_autumn: false,
			},
			{
				action: "created",
				item_id: null,
				price_id: "price_PREVIEW_abc",
				plan_id: "premium",
				feature_id: null,
				display_name: "premium",
				quantity: 1,
				previous_attributes: null,
				creates_price: true,
				managed_by_autumn: true,
			},
		]);
	});

	test("skips metadata-only item updates", () => {
		expect(
			subscriptionActionToProcessorItemChanges({
				subscriptionAction: {
					type: "update",
					stripeSubscriptionId: "sub_live",
					params: {
						items: [{ id: "si_seats", quantity: 3 }, { id: "si_base" }],
					},
				},
				stripeSubscription: liveSubscription,
				priceIndex,
			}),
		).toEqual([]);
	});

	test("canceling deletes every live item", () => {
		const changes = subscriptionActionToProcessorItemChanges({
			subscriptionAction: { type: "cancel", stripeSubscriptionId: "sub_live" },
			stripeSubscription: liveSubscription,
			priceIndex,
		});

		expect(changes.map((change) => [change.action, change.item_id])).toEqual([
			["deleted", "si_base"],
			["deleted", "si_seats"],
			["deleted", "si_addon"],
		]);
	});
});

describe("checkoutSessionActionToProcessorItemChanges", () => {
	test("a subscription checkout creates every line item", () => {
		const changes = checkoutSessionActionToProcessorItemChanges({
			checkoutSessionAction: {
				type: "create",
				params: {
					mode: "subscription",
					line_items: [{ price: "price_pro_base", quantity: 1 }],
				},
			},
			priceIndex,
		});

		expect(changes.map((change) => [change.action, change.plan_id])).toEqual([
			["created", "pro"],
		]);
	});
});

const PHASE_THREE = PHASE_TWO + 30 * 24 * 60 * 60 * 1000;
const toSeconds = (epochMs: number) => Math.floor(epochMs / 1000);
const phasesAt = (...startsAts: number[]) =>
	startsAts.map((startsAt) => ({ startsAt, customerProductIds: [] }));
const scheduleCreate = (
	phases: Stripe.SubscriptionScheduleUpdateParams.Phase[],
) => ({ type: "create" as const, params: { phases } });
const summarize = (changes: ProcessorItemChange[]) =>
	changes.map((change) => [
		change.action,
		change.plan_id,
		change.quantity,
		change.previous_attributes,
	]);

describe("scheduleActionToProcessorItemChanges", () => {
	test("diffs each future phase against the Stripe phase active before it", () => {
		const changes = scheduleActionToProcessorItemChanges({
			subscriptionScheduleAction: scheduleCreate([
				{
					start_date: toSeconds(NOW),
					items: [
						{ price: "price_pro_base" },
						{ price: "price_pro_seats", quantity: 3 },
					],
				},
				{
					start_date: toSeconds(PHASE_TWO),
					items: [
						{ price: "price_PREVIEW_abc" },
						{ price: "price_pro_seats", quantity: 4 },
					],
				},
			]),
			phases: phasesAt(NOW, PHASE_TWO),
			priceIndex,
		});

		expect(changes.map(summarize)).toEqual([
			[
				["created", "premium", null, null],
				["updated", "pro", 4, { quantity: 3 }],
				["deleted", "pro", null, null],
			],
		]);
	});

	test("a schedule starting in the future diffs its first phase against nothing", () => {
		const changes = scheduleActionToProcessorItemChanges({
			subscriptionScheduleAction: scheduleCreate([
				{
					start_date: toSeconds(PHASE_TWO),
					items: [{ price: "price_pro_base" }],
				},
			]),
			phases: phasesAt(NOW, PHASE_TWO),
			priceIndex,
		});

		expect(changes.map(summarize)).toEqual([[["created", "pro", null, null]]]);
	});

	test("Stripe phases between Autumn phases roll into the net change", () => {
		const midPhase = NOW + 10 * 24 * 60 * 60 * 1000;
		const changes = scheduleActionToProcessorItemChanges({
			subscriptionScheduleAction: scheduleCreate([
				{
					start_date: toSeconds(NOW),
					items: [
						{ price: "price_pro_base" },
						{ price: "price_pro_seats", quantity: 3 },
					],
				},
				{
					start_date: toSeconds(midPhase),
					items: [{ price: "price_pro_base" }],
				},
				{
					start_date: toSeconds(PHASE_TWO),
					items: [{ price: "price_PREVIEW_abc" }],
				},
			]),
			phases: phasesAt(NOW, PHASE_TWO, PHASE_THREE),
			priceIndex,
		});

		expect(changes.map(summarize)).toEqual([
			[
				["created", "premium", null, null],
				["deleted", "pro", null, null],
				["deleted", "pro", 3, null],
			],
			[],
		]);
	});

	test("inline items on the same price stay separate per customer price", () => {
		const inlineSeat = (customerPriceId: string) => ({
			price_data: {
				currency: "usd",
				product: "prod_seats",
				unit_amount: 1000,
				recurring: { interval: "month" as const },
			},
			quantity: 1,
			metadata: {
				autumn_price_id: "pro_seats",
				autumn_customer_price_id: customerPriceId,
			},
		});

		const changes = scheduleActionToProcessorItemChanges({
			subscriptionScheduleAction: scheduleCreate([
				{
					start_date: toSeconds(NOW),
					items: [inlineSeat("cus_price_entity_1")],
				},
				{
					start_date: toSeconds(PHASE_TWO),
					items: [
						inlineSeat("cus_price_entity_1"),
						inlineSeat("cus_price_entity_2"),
					],
				},
			]),
			phases: phasesAt(NOW, PHASE_TWO),
			priceIndex,
		});

		expect(changes.map(summarize)).toEqual([[["created", "pro", 1, null]]]);
	});
});
