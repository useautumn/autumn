import type { BillingInterval } from "@autumn/shared";
import type Stripe from "stripe";

export interface ScheduleObj {
	schedule: Stripe.SubscriptionSchedule;
	interval: BillingInterval;
	intervalCount: number;
	prices: Stripe.Price[];
}
