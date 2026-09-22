/**
 * Billing Verify: unlinked prices in a scheduled phase
 *
 * Both shapes came out of a production audit where verify reported a
 * future-phase item as missing although Stripe carried it.
 *
 * Red (current):
 *   - A scheduled prepaid price with nothing purchased renders an expected
 *     item of quantity 0; Stripe has no item, and verify reports
 *     prepaid_quantity_mismatch "expected 0, Stripe has 0".
 * Green (after): the subscription verifies as "correct".
 *
 * Also covered: a scheduled fixed price with no stored Stripe id whose phase
 * item is an untagged, archived price at the same amount matches on totals in
 * non-strict mode and is reported in strict mode (identity semantics).
 */

import { expect, test } from "bun:test";
import {
	type CreateScheduleParamsV0Input,
	findPriceByFeatureId,
	ms,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { listActiveStripeSubscriptions } from "../restore/utils/corruptStripeSubscription";
import { clearPriceStripeIds } from "./utils/clearPriceStripeIds";

const activeSubscriptionFor = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) throw new Error("Customer has no Stripe customer ID");
	const [subscription] = await listActiveStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	return subscription;
};

const phaseItemPriceId = (item: Stripe.SubscriptionSchedule.Phase.Item) =>
	typeof item.price === "string" ? item.price : item.price.id;

const phaseItemPrice = (item: Stripe.SubscriptionSchedule.Phase.Item) =>
	typeof item.price !== "string" && "recurring" in item.price
		? item.price
		: undefined;

const scheduleIdOf = (subscription: Stripe.Subscription) =>
	typeof subscription.schedule === "string"
		? subscription.schedule
		: subscription.schedule?.id;

const phaseUpdateParams = (
	phase: Stripe.SubscriptionSchedule.Phase,
	items: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[],
): Stripe.SubscriptionScheduleUpdateParams.Phase => ({
	start_date: phase.start_date,
	end_date: phase.end_date,
	proration_behavior: "none",
	items,
});

/** Rewrites the schedule so the last phase no longer carries the given
 * price — Stripe's view of a plan whose prepaid quantity is zero. */
const dropLastPhaseItem = async ({
	ctx,
	scheduleId,
	priceId,
}: {
	ctx: TestContext;
	scheduleId: string;
	priceId: string;
}) => {
	const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
		scheduleId,
		{ expand: ["phases.items.price"] },
	);
	const lastIndex = schedule.phases.length - 1;
	const phases = schedule.phases.map((phase, index) =>
		phaseUpdateParams(
			phase,
			phase.items
				.filter(
					(item) => index !== lastIndex || phaseItemPriceId(item) !== priceId,
				)
				.map((item) => ({
					price: phaseItemPriceId(item),
					...(item.quantity !== undefined && { quantity: item.quantity }),
				})),
		),
	);
	await ctx.stripeCli.subscriptionSchedules.update(scheduleId, { phases });
};

const prepaidStripePriceIdFor = async ({
	ctx,
	productId,
	featureId,
}: {
	ctx: TestContext;
	productId: string;
	featureId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const price = findPriceByFeatureId({ prices: fullProduct.prices, featureId });
	const priceId = (price?.config as { stripe_prepaid_price_v2_id?: string })
		?.stripe_prepaid_price_v2_id;
	if (!priceId) throw new Error(`No prepaid Stripe price on ${productId}`);
	return priceId;
};

/** Rewrites the schedule so the last phase bills an untagged, archived clone
 * of its fixed price — what a hand-edited or restored schedule looks like. */
const swapLastPhaseFixedItemForUntaggedClone = async ({
	ctx,
	scheduleId,
}: {
	ctx: TestContext;
	scheduleId: string;
}) => {
	const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
		scheduleId,
		{ expand: ["phases.items.price"] },
	);
	const lastIndex = schedule.phases.length - 1;
	const fixedItem = schedule.phases[lastIndex].items.find(
		(item) => phaseItemPrice(item)?.recurring?.usage_type === "licensed",
	);
	const source = fixedItem && phaseItemPrice(fixedItem);
	if (!source) throw new Error("Expected a fixed item in the last phase");

	const clone = await ctx.stripeCli.prices.create({
		product: source.product as string,
		currency: source.currency,
		unit_amount_decimal: source.unit_amount_decimal ?? `${source.unit_amount}`,
		recurring: {
			interval: source.recurring?.interval ?? "month",
			interval_count: source.recurring?.interval_count ?? 1,
		},
		nickname: "unlinked-phase-clone",
	});

	await ctx.stripeCli.subscriptionSchedules.update(scheduleId, {
		phases: schedule.phases.map((phase, index) =>
			phaseUpdateParams(
				phase,
				phase.items.map((item) => ({
					price:
						index === lastIndex && item === fixedItem
							? clone.id
							: phaseItemPriceId(item),
					...(item.quantity !== undefined && { quantity: item.quantity }),
				})),
			),
		),
	});
	await ctx.stripeCli.prices.update(clone.id, { active: false });
	return clone;
};

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked-phase 1: scheduled prepaid with nothing purchased -> correct")}`,
	async () => {
		const customerId = "verify-phase-prepaid-zero";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const next = products.premium({
			id: "next",
			items: [items.prepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, next] }),
			],
			actions: [],
		});

		const now = Date.now();
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: now, plans: [{ plan_id: pro.id }] },
				{ starts_at: now + ms.days(30), plans: [{ plan_id: next.id }] },
			],
		};
		expect((await autumnV1.billing.createSchedule(params)).status).toBe(
			"created",
		);

		const scheduleId = scheduleIdOf(
			await activeSubscriptionFor({ ctx, customerId }),
		);
		if (!scheduleId) throw new Error("Expected a schedule on the subscription");
		await dropLastPhaseItem({
			ctx,
			scheduleId,
			priceId: await prepaidStripePriceIdFor({
				ctx,
				productId: next.id,
				featureId: TestFeature.Messages,
			}),
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions).toHaveLength(1);
		expect(result.subscriptions[0].mismatches).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked-phase 2: scheduled fixed price unlinked + untagged same-amount phase item -> totals match, strict reports")}`,
	async () => {
		const customerId = "verify-phase-fixed-unlinked";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const next = products.premium({
			id: "next",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, next] }),
			],
			actions: [],
		});

		const now = Date.now();
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: now, plans: [{ plan_id: pro.id }] },
				{ starts_at: now + ms.days(30), plans: [{ plan_id: next.id }] },
			],
		};
		expect((await autumnV1.billing.createSchedule(params)).status).toBe(
			"created",
		);

		const scheduleId = scheduleIdOf(
			await activeSubscriptionFor({ ctx, customerId }),
		);
		if (!scheduleId) throw new Error("Expected a schedule on the subscription");

		await clearPriceStripeIds({
			ctx,
			productId: next.id,
			slots: ["stripe_price_id"],
		});
		await swapLastPhaseFixedItemForUntaggedClone({ ctx, scheduleId });

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions).toHaveLength(1);
		expect(lenient.subscriptions[0].mismatches).toEqual([]);

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].mismatches).toMatchObject([
			{ type: "base_price_mismatch", reason: "missing" },
			{ type: "item_mismatch", reason: "unexpected" },
		]);
	},
);
