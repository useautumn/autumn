import { BillingInterval } from "@autumn/shared";
import Stripe from "stripe";

export interface ScheduleObj {
	schedule: Stripe.SubscriptionSchedule;
	interval: BillingInterval;
	intervalCount: number;
	prices: Stripe.Price[];
}
