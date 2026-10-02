import {
	CusProductStatus,
	type FullCusProduct,
	type SyncProposalV2,
} from "@autumn/shared";
import type Stripe from "stripe";

const FIXED_MONTHLY_PRICE = {
	price: { config: { type: "fixed", amount: 20, interval: "month" } },
};

export const makeCustomerProduct = ({
	id,
	productName,
	subscriptionIds = [],
	scheduledIds = [],
	status = CusProductStatus.Active,
	entityId = null,
	isFree = false,
}: {
	id: string;
	productName: string;
	subscriptionIds?: string[];
	scheduledIds?: string[];
	status?: CusProductStatus;
	entityId?: string | null;
	isFree?: boolean;
}): FullCusProduct =>
	({
		id,
		product_id: `prod_${id}`,
		internal_product_id: `int_prod_${id}`,
		product: { id: `prod_${id}`, name: productName },
		status,
		subscription_ids: subscriptionIds,
		scheduled_ids: scheduledIds,
		entity_id: entityId,
		internal_entity_id: entityId ? `int_${entityId}` : null,
		customer_prices: isFree ? [] : [FIXED_MONTHLY_PRICE],
		customer_entitlements: [],
		options: [],
	}) as unknown as FullCusProduct;

const SECONDS_PER_DAY = 86_400;
export const PERIOD_START_SECONDS = 1_790_000_000;
export const PERIOD_END_SECONDS = PERIOD_START_SECONDS + 30 * SECONDS_PER_DAY;

export const makeStripeSubscription = ({
	id,
	status = "active",
	cancelAtPeriodEnd = false,
	cancelAt = null,
	interval = "month",
	intervalCount = 1,
}: {
	id: string;
	status?: Stripe.Subscription.Status;
	cancelAtPeriodEnd?: boolean;
	cancelAt?: number | null;
	interval?: Stripe.Price.Recurring.Interval;
	intervalCount?: number;
}): Stripe.Subscription =>
	({
		id,
		status,
		cancel_at_period_end: cancelAtPeriodEnd,
		cancel_at: cancelAt,
		pause_collection: null,
		items: {
			data: [
				{
					current_period_start: PERIOD_START_SECONDS,
					current_period_end: PERIOD_END_SECONDS,
					price: { recurring: { interval, interval_count: intervalCount } },
				},
			],
		},
	}) as unknown as Stripe.Subscription;

export const makeStripeSchedule = ({
	id,
	status = "not_started",
	startDate = PERIOD_END_SECONDS,
}: {
	id: string;
	status?: Stripe.SubscriptionSchedule.Status;
	startDate?: number;
}): Stripe.SubscriptionSchedule =>
	({
		id,
		status,
		phases: [{ start_date: startDate }],
	}) as unknown as Stripe.SubscriptionSchedule;

export const makeProposal = ({
	subscription = null,
	schedule = null,
}: {
	subscription?: Stripe.Subscription | null;
	schedule?: Stripe.SubscriptionSchedule | null;
}): SyncProposalV2 => ({
	stripe_subscription_id: subscription?.id,
	stripe_schedule_id: schedule?.id,
	phases: [],
	stripe_subscription: subscription,
	stripe_schedule: schedule,
	already_linked_product_id: null,
});
